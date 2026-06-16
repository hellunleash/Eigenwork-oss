#!/usr/bin/env node
// scripts/diagnose-match.mjs
//
// Explain why each candidate is KEPT or DROPPED by the match pipeline for a
// given JD. Walks the same gates as runMatch (lib worker / app/api/jd/match):
// pool membership -> role-fit -> score >= 50 -> work-auth, plus the cached
// matchResult that the results page serves.
//
// Dependency-free beyond firebase-admin / @google/generative-ai (both already
// project deps). Reads the SAME env the app uses.
//
// Usage:
//   node scripts/diagnose-match.mjs <jobId>
//   npm run diagnose:match -- <jobId>
//
// Env required: FIREBASE_SERVICE_ACCOUNT_KEY (+ NEXT_PUBLIC_FIREBASE_PROJECT_ID),
// optional GEMINI_API_KEY (without it, role-fit is shown as "?" and skipped in
// the verdict so you still see the score/work-auth/pool decisions).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// --- env loading (mirror diagnose-github) ----------------------------------
function loadDotEnvFallback() {
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    let text;
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}
try {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  loadDotEnvFallback();
}

const PASS = "  ✓";
const FAIL = "  ✗";
const INFO = "  •";

// --- helpers mirrored from the match pipeline ------------------------------
function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
function normalizeLocation(s) {
  const t = (s || "").trim().toLowerCase();
  if (t === "on-site" || t === "onsite") return "onsite";
  if (t === "remote") return "remote";
  if (t === "hybrid") return "hybrid";
  return (s || "").trim().toLowerCase();
}
function getJDOneLiner(jd) {
  const rf = jd.role_fit;
  if (rf && typeof rf === "object" && "one_liner" in rf) return String(rf.one_liner ?? "").trim();
  if (typeof jd.role_fit_one_liner === "string") return jd.role_fit_one_liner.trim();
  return "";
}
function getCandOneLiner(c) {
  const rf = c?.profile?.role_fit;
  if (typeof rf === "string") return rf.trim();
  if (rf && typeof rf === "object" && "one_liner" in rf) return String(rf.one_liner ?? "").trim();
  return "";
}
// workAuthMatch WITH the missing-data fix applied.
function workAuthMatch(jobAuth, jobLocationTypes, candidateAuthRegions) {
  if (jobAuth?.provided) return true;
  const regions = toArray(candidateAuthRegions).map((r) => String(r).toLowerCase());
  if (regions.length === 0) return true; // no data -> don't reject
  const hasRemoteGlobal = regions.some((r) => r.includes("remote") && r.includes("global"));
  if (hasRemoteGlobal) {
    const job = jobLocationTypes.map(normalizeLocation);
    if (!job.includes("remote")) return false;
  }
  if (jobAuth?.us_required && !regions.some((r) => r.includes("us"))) return false;
  if (jobAuth?.eu_required && !regions.some((r) => r.includes("eu"))) return false;
  return true;
}

const ROLE_FIT_PROMPT = `You are a senior hiring-matching assistant. For each candidate one-liner, classify role fit vs the JD one-liner as MATCH, ADJACENT, or NO MATCH. PRIMARY stack/role decides; secondary/tertiary never cause a NO MATCH; treat ML/AI/Data as one adjacent family; titles are fuzzy. Output one line per candidate, EXACTLY: "N → MATCH" | "N → ADJACENT" | "N → NO MATCH". No other text.`;

async function classifyRoleFit(jdOneLiner, candOneLiners) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!jdOneLiner) return candOneLiners.map(() => "MATCH (no JD one-liner → fail-open)");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0, topK: 1, topP: 1, thinkingConfig: { thinkingBudget: 0 } },
  });
  let prompt = `${ROLE_FIT_PROMPT}\n\nJD:\n${jdOneLiner}\n\nCandidates:\n`;
  candOneLiners.forEach((l, i) => { prompt += `${i + 1}. ${l || "(empty)"}\n`; });
  const res = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const raw = res.response.text() ?? "";
  const labels = new Array(candOneLiners.length).fill("NO MATCH");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s*→\s*(MATCH|ADJACENT|NO MATCH)/i);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (idx >= 0 && idx < labels.length) labels[idx] = m[2].toUpperCase();
  }
  return labels;
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: node scripts/diagnose-match.mjs <jobId>");
    process.exit(1);
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  let credential;
  try {
    credential = key ? cert(JSON.parse(key)) : applicationDefault();
  } catch (e) {
    console.error("Failed to build Firebase credential. Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON).", e);
    process.exit(1);
  }
  if (!getApps().length) initializeApp({ credential, projectId: projectId || undefined });
  const db = getFirestore();

  console.log(`\nDiagnosing match for jobId=${jobId}\n${"=".repeat(64)}`);

  // 1. JD
  const jdSnap = await db.collection("jds").doc(jobId).get();
  if (!jdSnap.exists) {
    console.log(`${FAIL} JD not found. Wrong jobId?`);
    process.exit(0);
  }
  const jd = jdSnap.data() ?? {};
  const jdOneLiner = getJDOneLiner(jd);
  const jobAuth = jd.work_auth_requirement ?? {};
  const jobLocationTypes = toArray(jd.location_type).map(String);
  console.log("\n[1] JD");
  console.log(`${INFO} role_fit one-liner: ${jdOneLiner ? `"${jdOneLiner}"` : "(EMPTY → role-fit fails open, everyone MATCH)"}`);
  console.log(`${INFO} work_auth_requirement: ${JSON.stringify(jobAuth)}`);
  console.log(`${INFO} location_type: ${JSON.stringify(jd.location_type)}`);
  if (jobAuth?.us_required || jobAuth?.eu_required) {
    console.log(`     NOTE: this JD requires work auth → candidates with NO stored authRegions used to be dropped (the bug). With the fix, missing data passes; new submissions are filtered strictly.`);
  }

  // 2. Cached matchResult (what the results page actually serves)
  const cached = jd.matchResult;
  // Field renamed top10 → top20 (ADR-009 Unit 4); tolerate legacy docs still on top10.
  const cachedList = cached?.top20 ?? cached?.top10;
  const cachedIds = Array.isArray(cachedList) ? cachedList.map((t) => t?.id) : null;
  console.log("\n[2] Cached matchResult (served by the results page)");
  if (cachedIds) {
    console.log(`${INFO} CACHED: top20 has ${cachedIds.length} ids, completedAt=${cached.completedAt ? "set" : "?"}`);
    console.log(`     The UI returns this cache and will NOT recompute. If it's stale, clear it (apply a new intake / new-intake route deletes matchResult) then re-match.`);
  } else {
    console.log(`${INFO} none — next match computes fresh.`);
  }

  // 3. Pool
  const poolSnap = await db.collection("candidates").where("matchData.jobId", "==", jobId).get();
  console.log(`\n[3] Pool (candidates with matchData.jobId == "${jobId}")`);
  console.log(`${poolSnap.size === 0 ? FAIL : PASS} ${poolSnap.size} candidate(s)`);
  if (poolSnap.size === 0) {
    console.log(`     The candidate you expect isn't in THIS JD's pool — they were evaluated under a different jobId. Matching is per-JD; it never pulls candidates from other JDs.`);
    process.exit(0);
  }

  const cands = poolSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const oneLiners = cands.map(getCandOneLiner);

  // 4. Role-fit (optional, needs Gemini)
  let labels = null;
  try {
    labels = await classifyRoleFit(jdOneLiner, oneLiners);
  } catch (e) {
    console.log(`\n[4] Role-fit: Gemini call failed (${String(e).slice(0, 120)})`);
  }

  // 5. Per-candidate verdict
  console.log("\n[4/5] Per-candidate decisions");
  let dropPool = 0, dropRoleFit = 0, dropScore = 0, dropAuth = 0, keep = 0;
  cands.forEach((c, i) => {
    const score = Number(c.score);
    const matchable = Number.isFinite(score) && score >= 50;
    const label = labels ? labels[i] : "?";
    const roleOk = labels ? label.startsWith("MATCH") || label.startsWith("ADJACENT") : true;
    const authReg = c?.matchData?.authRegions;
    const authOk = workAuthMatch(jobAuth, jobLocationTypes, authReg);
    const inCache = cachedIds ? cachedIds.includes(c.id) : null;

    let verdict, reason;
    if (labels && !roleOk) { verdict = "DROP"; reason = `role-fit=${label}`; dropRoleFit++; }
    else if (!matchable) { verdict = "DROP"; reason = `score ${Number.isFinite(score) ? score : "missing"} < 50`; dropScore++; }
    else if (!authOk) { verdict = "DROP"; reason = "work-auth"; dropAuth++; }
    else { verdict = "KEEP"; reason = ""; keep++; }

    console.log(`\n  ${verdict === "KEEP" ? "✓" : "✗"} ${c.candidateName || "(no name)"} [${c.id}] → ${verdict}${reason ? ` (${reason})` : ""}`);
    console.log(`      score=${Number.isFinite(score) ? score : "MISSING"} matchable=${matchable} role-fit=${label}`);
    console.log(`      candidate one-liner: ${oneLiners[i] ? `"${oneLiners[i]}"` : "(EMPTY → auto NO MATCH in real pipeline!)"}`);
    console.log(`      matchData.authRegions: ${authReg === undefined ? "MISSING (legacy/pre-fix)" : JSON.stringify(authReg)} → work-auth ${authOk ? "pass" : "FAIL"}`);
    if (inCache === false) console.log(`      NOTE: not in cached top20 → won't show in UI until cache is recomputed.`);
  });

  console.log(`\n${"=".repeat(64)}\nSummary: KEEP ${keep} | dropped — role-fit ${dropRoleFit}, score ${dropScore}, work-auth ${dropAuth}` + (labels ? "" : "  (role-fit not run; no GEMINI_API_KEY)"));
  if (dropAuth > 0) console.log("  Work-auth dropped candidates — check the JD's work_auth_requirement vs each candidate's authRegions above.");
  console.log("");
  process.exit(0);
}

main().catch((e) => { console.error("diagnose-match crashed:", e); process.exit(1); });
