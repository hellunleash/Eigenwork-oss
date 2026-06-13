#!/usr/bin/env -S npx tsx
// scripts/backfill-github-metrics.ts
//
// One-shot backfill that populates `github_metrics` on junior candidate docs
// that were evaluated BEFORE ADR-007 (when the pre-ADR runner computed but
// did not persist the metrics). For each eligible candidate, re-runs the
// deterministic GitHub-signal pipeline (2 API calls per repo, no LLM cost)
// and writes only signal.metrics — score, breakdown, card, and everything
// else on the doc are untouched.
//
// Senior candidates are skipped (the senior track never runs GitHub).
//
// Usage:
//   npx tsx scripts/backfill-github-metrics.ts            (dry run)
//   npx tsx scripts/backfill-github-metrics.ts --apply    (writes)
//
// Env: reads FIREBASE_SERVICE_ACCOUNT_KEY / NEXT_PUBLIC_FIREBASE_PROJECT_ID
// / GITHUB_TOKEN or GITHUB_APP_* from .env.local.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    // fall through
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
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

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  await loadEnv();

  // Lazy-import after env load so firebase-admin sees the service account.
  const { getGithubSignal } = await import("@/lib/github-signals");
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!key) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY missing");
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(key)), projectId: projectId || undefined });
  }
  const db = getFirestore();

  const snap = await db.collection("candidates").get();
  let scanned = 0;
  let skippedSenior = 0;
  let alreadyHas = 0;
  let noGithub = 0;
  let updated = 0;
  let unavailable = 0;
  let noEvidence = 0;

  for (const doc of snap.docs) {
    scanned++;
    const d = doc.data() ?? {};
    const exp = d.experienceLevel;
    if (exp !== "Junior") {
      skippedSenior++;
      continue;
    }
    if (d.github_metrics) {
      alreadyHas++;
      continue;
    }
    const matchData = (d.matchData ?? {}) as Record<string, unknown>;
    const githubUrl =
      typeof matchData.github === "string" && matchData.github.trim()
        ? matchData.github.trim()
        : null;
    if (!githubUrl) {
      noGithub++;
      console.log(`. no-github  ${doc.id}  name="${d.candidateName ?? ""}"`);
      continue;
    }

    process.stdout.write(`  fetching ${doc.id}  url=${githubUrl} ... `);
    let signal;
    try {
      signal = await getGithubSignal(githubUrl);
    } catch (err) {
      console.log(`THROW (${err instanceof Error ? err.message : String(err)})`);
      unavailable++;
      continue;
    }
    if (signal.status === "unavailable") {
      console.log("unavailable");
      unavailable++;
      continue;
    }
    if (signal.status === "no_evidence" || !signal.metrics) {
      console.log("no_evidence");
      noEvidence++;
      continue;
    }
    console.log(`ok (${signal.apiCalls} API calls)`);
    if (apply) {
      await doc.ref.set({ github_metrics: signal.metrics }, { merge: true });
    }
    updated++;
  }

  console.log(
    `\nDone. scanned=${scanned} updated=${updated} already=${alreadyHas} ` +
      `senior=${skippedSenior} no-github=${noGithub} unavailable=${unavailable} ` +
      `no-evidence=${noEvidence}` +
      (apply ? "" : "  (dry run — pass --apply to write)")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
