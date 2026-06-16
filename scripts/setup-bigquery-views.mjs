#!/usr/bin/env node
// scripts/setup-bigquery-views.mjs
//
// ADR-009 Phase 0 (documented future path). Idempotent, guarded creator of the
// BigQuery dataset + the three "latest state" views over the Firebase
// Firestore→BigQuery extension's `*_raw_changelog` tables. The view bodies live
// in docs/bigquery/*.sql (single source of truth); this script reads them,
// substitutes ${PROJECT}/${DATASET}, prints the DDL, and (only with --apply)
// creates/replaces the dataset + views.
//
// This adds NO runtime dependency to the app build. `@google-cloud/bigquery` is
// deliberately NOT in package.json — it is dynamically import()ed only under
// --apply, so the package matters only when you actually create views.
//
// Usage:
//   node scripts/setup-bigquery-views.mjs            # print dataset + DDL, NO network, exit 0
//   node scripts/setup-bigquery-views.mjs --apply    # create/replace dataset + views (needs creds + package)
//   node scripts/setup-bigquery-views.mjs --help
//
// Env (read from .env.local via @next/env, matching the app's loading path):
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID   GCP/Firebase project id (required)
//   BIGQUERY_DATASET                  dataset id (optional; default "eigenwork_analytics")
//   BIGQUERY_LOCATION                 dataset location (optional; default "us-central1")

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATASET = "eigenwork_analytics";
const DEFAULT_LOCATION = "us-central1";

// View name -> source .sql file under docs/bigquery/. Order matters:
// shortlist_funnel reads candidates_latest + jds_latest, so create those first.
const VIEW_FILES = [
  { view: "candidates_latest", file: "candidates_latest.sql" },
  { view: "jds_latest", file: "jds_latest.sql" },
  { view: "shortlist_funnel", file: "shortlist_funnel.sql" },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const BQ_DOCS_DIR = join(REPO_ROOT, "docs", "bigquery");

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

function printHelp() {
  console.log(`setup-bigquery-views.mjs — ADR-009 BigQuery future-path views (Phase 0)

Usage:
  node scripts/setup-bigquery-views.mjs            Preview dataset + DDL (no network), exit 0
  node scripts/setup-bigquery-views.mjs --apply    Create/replace dataset + views
  node scripts/setup-bigquery-views.mjs --help     This message

Env (.env.local):
  NEXT_PUBLIC_FIREBASE_PROJECT_ID   required for --apply (and shown in the preview)
  BIGQUERY_DATASET                  optional, default "${DEFAULT_DATASET}"
  BIGQUERY_LOCATION                 optional, default "${DEFAULT_LOCATION}"

The view bodies live in docs/bigquery/*.sql. They query the Firebase
Firestore->BigQuery extension's *_raw_changelog tables; install that extension
and backfill first (see docs/bigquery/README.md). @google-cloud/bigquery is NOT
a package.json dependency — it is imported only under --apply.`);
}

// Read a .sql view file and substitute the project/dataset placeholders.
function renderDdl(fileName, project, dataset) {
  const p = join(BQ_DOCS_DIR, fileName);
  if (!existsSync(p)) {
    throw new Error(`view source not found: ${p}`);
  }
  const raw = readFileSync(p, "utf8");
  return raw.split("${PROJECT}").join(project).split("${DATASET}").join(dataset);
}

async function apply({ project, dataset, location, ddls }) {
  let BigQuery;
  try {
    ({ BigQuery } = await import("@google-cloud/bigquery"));
  } catch {
    console.error(
      "--apply needs @google-cloud/bigquery, which is not installed (by design — " +
        "it is not a package.json dependency). Install it just for this run:\n" +
        "  npm install --no-save @google-cloud/bigquery\n" +
        "then re-run with --apply."
    );
    process.exit(1);
  }

  let client;
  try {
    client = new BigQuery({ projectId: project });
  } catch (err) {
    console.error("Could not construct a BigQuery client (check GCP credentials):", err?.message ?? err);
    process.exit(1);
  }

  try {
    // 1. Ensure the dataset exists (idempotent).
    const ds = client.dataset(dataset);
    const [exists] = await ds.exists();
    if (!exists) {
      await ds.create({ location });
      console.log(`+ created dataset ${project}.${dataset} (${location})`);
    } else {
      console.log(`. dataset ${project}.${dataset} already exists`);
    }

    // 2. Create/replace each view in dependency order.
    for (const { view, ddl } of ddls) {
      await client.query({ query: ddl, location });
      console.log(`~ created/replaced view ${project}.${dataset}.${view}`);
    }
  } catch (err) {
    console.error("BigQuery apply failed:", err?.message ?? err);
    process.exit(1);
  }

  console.log(`\nDone: ${ddls.length} view(s) ensured in ${project}.${dataset}.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const isApply = args.includes("--apply");

  await loadEnv();

  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const dataset = process.env.BIGQUERY_DATASET || DEFAULT_DATASET;
  const location = process.env.BIGQUERY_LOCATION || DEFAULT_LOCATION;

  // Render all DDLs up front. Use a placeholder project token in preview mode so
  // the script is fully usable with no env configured (still zero network).
  const projectForDdl = project || "<NEXT_PUBLIC_FIREBASE_PROJECT_ID>";
  let ddls;
  try {
    ddls = VIEW_FILES.map(({ view, file }) => ({
      view,
      ddl: renderDdl(file, projectForDdl, dataset),
    }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (!isApply) {
    console.log("# ADR-009 BigQuery views — PREVIEW (no --apply, no network calls)\n");
    console.log(`# project:  ${projectForDdl}`);
    console.log(`# dataset:  ${dataset}`);
    console.log(`# location: ${location}\n`);
    console.log(`# Dataset DDL (idempotent — the script uses dataset.create() when missing):`);
    console.log(`CREATE SCHEMA IF NOT EXISTS \`${projectForDdl}.${dataset}\` OPTIONS(location='${location}');\n`);
    for (const { view, ddl } of ddls) {
      console.log(`-- ===== ${view} =====`);
      console.log(ddl.trimEnd());
      console.log();
    }
    console.log("# Re-run with --apply to create/replace the dataset + views.");
    return;
  }

  // --apply path needs a real project id.
  if (!project) {
    console.error("NEXT_PUBLIC_FIREBASE_PROJECT_ID missing from env. Add it to .env.local or export it.");
    process.exit(1);
  }

  await apply({ project, dataset, location, ddls });
}

main().catch((err) => {
  console.error("setup-bigquery-views failed:", err);
  process.exit(1);
});
