#!/usr/bin/env node
// scripts/diagnose-card-doc.mjs
// Inspect the ADR-007 fields on a single candidate doc. Helps decide
// whether the empty-card UI is a match-endpoint pass-through bug or an
// upstream evaluation-runner / rubric bug.
//
// Usage: node scripts/diagnose-card-doc.mjs <candidateId>

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

async function loadEnv() {
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

async function main() {
  const argId = process.argv[2];
  await loadEnv();

  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY missing");
    process.exit(1);
  }
  const parsed = JSON.parse(key);
  if (getApps().length === 0) {
    initializeApp({ credential: cert(parsed), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }
  const db = getFirestore();

  let snap;
  if (argId) {
    snap = await db.collection("candidates").doc(argId).get();
    if (!snap.exists) {
      console.error(`candidate ${argId} not found`);
      process.exit(1);
    }
  } else {
    const qs = await db.collection("candidates").orderBy("evaluatedAt", "desc").limit(1).get();
    if (qs.empty) {
      console.error("no candidates found");
      process.exit(1);
    }
    snap = qs.docs[0];
  }

  const d = snap.data() || {};
  console.log(`candidateId: ${snap.id}`);
  console.log(`evaluatedAt: ${d.evaluatedAt ? new Date(d.evaluatedAt._seconds * 1000).toISOString() : "<missing>"}`);
  console.log(`rubric_version: ${d.rubric_version ?? "<missing>"}`);
  console.log(`score: ${d.score ?? "<missing>"}`);
  console.log(`yoe: ${d.yoe ?? "<missing>"}`);
  console.log();
  console.log("--- card ---");
  console.log(JSON.stringify(d.card ?? null, null, 2));
  console.log();
  console.log("--- github_metrics keys ---");
  console.log(d.github_metrics ? Object.keys(d.github_metrics).join(", ") : "<missing>");
  console.log();
  console.log("--- work_history ---");
  console.log(JSON.stringify(d.work_history ?? null, null, 2));
  console.log();
  console.log("--- profile.role_fit ---");
  const profile = d.profile;
  console.log(JSON.stringify(profile && typeof profile === "object" ? profile.role_fit : null, null, 2));
  console.log();
  console.log("--- profile.title / .edge / .flag (model-emitted) ---");
  if (profile && typeof profile === "object") {
    console.log("title:", JSON.stringify(profile.title));
    console.log("edge:", JSON.stringify(profile.edge));
    console.log("flag:", JSON.stringify(profile.flag));
  } else {
    console.log("<no profile>");
  }
  console.log();
  console.log("--- overlord_verdict ---");
  console.log(JSON.stringify(d.overlord_verdict ?? null, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
