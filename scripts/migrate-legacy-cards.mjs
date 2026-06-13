#!/usr/bin/env node
// scripts/migrate-legacy-cards.mjs
//
// One-shot migration that derives a result-card payload from each legacy
// candidate doc (ADR-007 Phase 6). After this script runs, no doc in the
// `candidates` collection carries `decision_line` and every doc that had
// a score also has a `card` field, so the new UI never hits a stub state.
//
// Derivation (deterministic, no LLM cost, no extra API calls):
//   - card.title = role_fit.one_liner ?? role_fit.title ?? "Candidate"
//   - card.edge  = strongest block's justification with any
//                  "ESQ:" / "PDQ:" / "NR:" / "OM:" / "OD:" / "PC:" prefix
//                  stripped (the banned-token regex check that the new
//                  fallback would apply at run time).
//   - card.flag  = overlord_verdict.triggered[0].reason ?? null
//
// Idempotent: re-running is safe. Docs that already have a card and no
// decision_line are skipped. Docs with neither field (mid-flight failures)
// are left untouched — the UI renders them as a minimal stub and the
// existing job retry mechanism re-queues them.
//
// Usage:
//   node scripts/migrate-legacy-cards.mjs            (dry run — prints what would change)
//   node scripts/migrate-legacy-cards.mjs --apply    (writes changes)
//
// Env: reads FIREBASE_SERVICE_ACCOUNT_KEY / NEXT_PUBLIC_FIREBASE_PROJECT_ID
// from .env.local (loaded via @next/env to match the app's loading path).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BANNED_PREFIX_RE = /^(ESQ|PDQ|NR|OM|OD|PC)\s*[:—\-]\s*/i;

async function loadEnv() {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    // fall through to manual dotenv parse
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

function deriveTitle(data) {
  const profile = data.profile;
  const rf = profile && typeof profile === "object" ? profile.role_fit : undefined;
  if (rf && typeof rf === "object") {
    const oneLiner = typeof rf.one_liner === "string" ? rf.one_liner.trim() : "";
    if (oneLiner) return oneLiner;
    const title = typeof rf.title === "string" ? rf.title.trim() : "";
    if (title) return title;
  }
  if (typeof rf === "string" && rf.trim()) return rf.trim();
  return "Candidate";
}

function deriveEdge(data) {
  const breakdown = data.breakdown;
  if (!breakdown || typeof breakdown !== "object") return "";
  // Junior blocks: ESQ / PDQ / NR. Senior blocks: OM / OD / PC. Each block's
  // total score is stored under the same key as the block name (e.g.
  // breakdown.ESQ.ESQ). We pick the highest-scoring block whose justification
  // is non-empty.
  const candidates = [];
  for (const blockName of ["ESQ", "PDQ", "NR", "OM", "OD", "PC"]) {
    const block = breakdown[blockName];
    if (!block || typeof block !== "object") continue;
    const score = Number(block[blockName]);
    const just = typeof block.justification === "string" ? block.justification.trim() : "";
    if (!just || !Number.isFinite(score)) continue;
    candidates.push({ score, just });
  }
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].just.replace(BANNED_PREFIX_RE, "").trim();
}

function deriveFlag(data) {
  const verdict = data.overlord_verdict;
  if (!verdict || typeof verdict !== "object") return null;
  const triggered = Array.isArray(verdict.triggered) ? verdict.triggered : [];
  for (const t of triggered) {
    if (!t || typeof t !== "object") continue;
    const reason = typeof t.reason === "string" ? t.reason.trim() : "";
    if (reason) return reason;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  await loadEnv();

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!key) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY missing from env. Add it to .env.local or export it.");
    process.exit(1);
  }

  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

  let parsed;
  try {
    parsed = JSON.parse(key);
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON:", err.message);
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(parsed),
      projectId: projectId || undefined,
    });
  }

  const db = getFirestore();
  const snap = await db.collection("candidates").get();

  let scanned = 0;
  let migrated = 0;
  let already = 0;
  let nothing = 0;

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data() || {};
    const hasCard = !!data.card && typeof data.card === "object";
    const hasDecisionLine =
      !!(data.decision_line && typeof data.decision_line === "object") ||
      !!(data.profile && typeof data.profile === "object" && data.profile.decision_line);

    if (hasCard && !hasDecisionLine) {
      already++;
      continue;
    }
    if (!hasDecisionLine && !data.score) {
      // No card, no decision_line, no score — mid-flight failure or stub doc.
      // Leave it alone; the worker's retry mechanism will reprocess it.
      nothing++;
      continue;
    }

    const card = {
      title: deriveTitle(data),
      edge: deriveEdge(data),
      flag: deriveFlag(data),
    };

    if (!apply) {
      console.log(
        `dry-run ${doc.id}  title="${card.title.slice(0, 40)}"  edge_len=${card.edge.length}  flag=${card.flag ? "yes" : "no"}`
      );
      migrated++;
      continue;
    }

    const update = {
      card,
      decision_line: FieldValue.delete(),
    };
    // profile.decision_line is nested; clear it via dotted-path delete.
    if (data.profile && typeof data.profile === "object" && data.profile.decision_line) {
      update["profile.decision_line"] = FieldValue.delete();
    }

    await doc.ref.update(update);
    console.log(`migrated ${doc.id}  title="${card.title.slice(0, 40)}"  flag=${card.flag ? "yes" : "no"}`);
    migrated++;
  }

  console.log(
    `\nDone. scanned=${scanned} migrated=${migrated} already=${already} no-data=${nothing}` +
      (apply ? "" : "  (dry run — pass --apply to write)")
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
