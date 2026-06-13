#!/usr/bin/env node
// scripts/seed-brand-cache.mjs
//
// Seeds the `brand_cache` Firestore collection (ADR-007 §7) with 15
// well-known names: 5 FAANG + 10 tier-1 startups. Each doc is written with
// classifier:"manual" so subsequent model classifications cannot overwrite
// it. YC is intentionally NOT seeded (4000+ companies — "obvious" doesn't
// apply); the model fills YC labels in candidate-by-candidate as resumes
// surface them.
//
// Idempotent: re-run after editing SEED_LIST below and the changed entries
// will overwrite the previous manual values. Untouched entries keep their
// existing seen_count.
//
// Usage:
//   node scripts/seed-brand-cache.mjs
//
// Env: reads FIREBASE_SERVICE_ACCOUNT_KEY / NEXT_PUBLIC_FIREBASE_PROJECT_ID
// from .env.local (loaded via @next/env to match the app's loading path).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SEED_LIST = [
  // FAANG
  { employer: "Google", bucket: "FAANG" },
  { employer: "Meta", bucket: "FAANG" },
  { employer: "Amazon", bucket: "FAANG" },
  { employer: "Apple", bucket: "FAANG" },
  { employer: "Netflix", bucket: "FAANG" },
  // tier-1
  { employer: "Microsoft", bucket: "tier-1" },
  { employer: "Stripe", bucket: "tier-1" },
  { employer: "Anthropic", bucket: "tier-1" },
  { employer: "OpenAI", bucket: "tier-1" },
  { employer: "Datadog", bucket: "tier-1" },
  { employer: "Vercel", bucket: "tier-1" },
  { employer: "Snowflake", bucket: "tier-1" },
  { employer: "Databricks", bucket: "tier-1" },
  { employer: "Nvidia", bucket: "tier-1" },
  { employer: "Tesla", bucket: "tier-1" },
];

function normalizeEmployer(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

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

async function main() {
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
  const collection = db.collection("brand_cache");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of SEED_LIST) {
    const id = normalizeEmployer(entry.employer);
    if (!id) continue;
    const ref = collection.doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        employer: entry.employer,
        bucket: entry.bucket,
        classifier: "manual",
        classified_at: FieldValue.serverTimestamp(),
        seen_count: 0,
      });
      console.log(`+ created   ${id} → ${entry.bucket}`);
      created++;
      continue;
    }
    const data = snap.data() || {};
    if (data.classifier === "manual" && data.bucket === entry.bucket && data.employer === entry.employer) {
      console.log(`. unchanged ${id} → ${entry.bucket}`);
      skipped++;
      continue;
    }
    await ref.set(
      {
        employer: entry.employer,
        bucket: entry.bucket,
        classifier: "manual",
        classified_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`~ updated   ${id} → ${entry.bucket}`);
    updated++;
  }

  console.log(`\nSeed complete: ${created} created, ${updated} updated, ${skipped} unchanged.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
