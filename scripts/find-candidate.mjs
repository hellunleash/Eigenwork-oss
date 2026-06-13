#!/usr/bin/env node
// Quick lookup: print candidate ids matching a name fragment so the
// diagnose script can be pointed at them.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

async function loadEnv() {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {}
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
  const needle = (process.argv[2] || "").toLowerCase();
  await loadEnv();
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (getApps().length === 0) initializeApp({ credential: cert(parsed), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  const db = getFirestore();
  const snap = await db.collection("candidates").orderBy("evaluatedAt", "desc").limit(40).get();
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const name = String(d.candidateName ?? "");
    if (!needle || name.toLowerCase().includes(needle)) {
      console.log(
        `${doc.id}  name="${name}" score=${d.score} yoe=${d.yoe} hasCard=${!!d.card} hasGitMetrics=${!!d.github_metrics} workHist=${Array.isArray(d.work_history) ? d.work_history.length : "-"}`
      );
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
