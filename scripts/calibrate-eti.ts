#!/usr/bin/env -S npx tsx
// scripts/calibrate-eti.ts
//
// ETI scoring calibration harness — compares the v1 and v2 rubrics on a folder
// of real sample resumes so the founder can eyeball the score distributions
// BEFORE flipping ETI_RUBRIC_VERSION=v2 in production.
//
// For each candidate it runs lib/evaluation-runner.ts#runEvaluation TWICE in the
// same process: once with process.env.ETI_RUBRIC_VERSION='v1', once with ='v2'
// (activeRubricVersion() reads the env at call time, so a per-call swap is all it
// takes). It then prints a per-candidate comparison, a band-distribution table,
// and overlord trigger rates. Nothing is written to Firestore.
//
// IMPORTANT: a real run makes LIVE OpenAI / Gemini / DocumentAI / GitHub calls
// using the keys in .env.local. The founder runs this locally with their own
// keys; it is NEVER run in CI. With no argument (or a missing folder) it only
// prints usage and exits 0 — that path makes no network calls.
//
// Usage:
//   npx tsx scripts/calibrate-eti.ts <folder>
//
// Folder layout (see scripts/golden/README.md):
//   <folder>/
//     alice/   resume.pdf  meta.json   ({ "experience": "<2", "githubUrl": "..." })
//     bob/     resume.pdf  meta.json   ({ "experience": ">=2" })

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Don't crash with a nonzero exit if a downstream consumer closes the pipe
// early (e.g. `... | head`). EPIPE on stdout/stderr is benign for a reporter.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Experience = "<2" | ">=2";

type CandidateMeta = {
  githubUrl?: string | null;
  experience: Experience;
};

type Candidate = {
  name: string;
  resumePath: string;
  meta: CandidateMeta;
};

// runEvaluation's result type does not (yet) statically expose rubric_version on
// every branch of the redesign; read it defensively without leaning on `any`.
type RubricStamp = { rubric_version?: string | null };

type RunOutcome = {
  score: number;
  overlord?: string;
  rubricVersion?: string;
};

type Row = {
  name: string;
  experience: Experience;
  v1?: RunOutcome;
  v2?: RunOutcome;
  error?: string;
};

// ---------------------------------------------------------------------------
// Usage (the only path executed in CI/verification)
// ---------------------------------------------------------------------------

function printUsage(): void {
  const lines = [
    "",
    "ETI scoring calibration harness — compare rubric v1 vs v2 on sample resumes.",
    "",
    "Usage:",
    "  npx tsx scripts/calibrate-eti.ts <folder>",
    "",
    "<folder> contains one subfolder per candidate, each with:",
    "  resume.pdf   the candidate's resume",
    "  meta.json    { \"experience\": \"<2\" | \">=2\", \"githubUrl\"?: string }",
    "",
    "Each candidate is evaluated twice in one process: once with",
    "ETI_RUBRIC_VERSION=v1, once with =v2. Output (stdout only, no DB writes):",
    "  - per-candidate table: experience, v1/v2 score, delta, v1/v2 overlord",
    "  - band-distribution comparison (<50 / 50-64 / 65-79 / 80+) for v1 vs v2",
    "  - overlord trigger rates for v1 vs v2",
    "",
    "WARNING: a real run makes LIVE OpenAI / Gemini / DocumentAI / GitHub calls",
    "using the keys in .env.local. Run it locally, never in CI.",
    "",
    "See scripts/golden/README.md for the folder layout and post-run gates.",
    "",
  ];
  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Folder / candidate discovery (pure, no network)
// ---------------------------------------------------------------------------

function isExperience(v: unknown): v is Experience {
  return v === "<2" || v === ">=2";
}

function parseMeta(metaPath: string): CandidateMeta {
  const raw = readFileSync(metaPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`meta.json must be a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!isExperience(obj.experience)) {
    throw new Error(`meta.json "experience" must be "<2" or ">=2"`);
  }
  const githubUrl =
    typeof obj.githubUrl === "string" && obj.githubUrl.trim().length > 0
      ? obj.githubUrl.trim()
      : null;
  return { experience: obj.experience, githubUrl };
}

function discoverCandidates(folder: string): Candidate[] {
  const entries = readdirSync(folder)
    .map((name) => ({ name, full: join(folder, name) }))
    .filter((e) => {
      try {
        return statSync(e.full).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const resumePath = join(entry.full, "resume.pdf");
    const metaPath = join(entry.full, "meta.json");
    if (!existsSync(resumePath)) {
      console.warn(`  skip ${entry.name}: no resume.pdf`);
      continue;
    }
    if (!existsSync(metaPath)) {
      console.warn(`  skip ${entry.name}: no meta.json`);
      continue;
    }
    let meta: CandidateMeta;
    try {
      meta = parseMeta(metaPath);
    } catch (e) {
      console.warn(`  skip ${entry.name}: ${(e as Error).message}`);
      continue;
    }
    candidates.push({
      name: entry.name,
      resumePath,
      meta,
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const BANDS = [
  { label: "<50", test: (s: number) => s < 50 },
  { label: "50-64", test: (s: number) => s >= 50 && s < 65 },
  { label: "65-79", test: (s: number) => s >= 65 && s < 80 },
  { label: "80+", test: (s: number) => s >= 80 },
] as const;

function bandOf(score: number): string {
  return BANDS.find((b) => b.test(score))?.label ?? "?";
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function fmtScore(o?: RunOutcome): string {
  return o ? String(o.score) : "—";
}

function fmtOverlord(o?: RunOutcome): string {
  if (!o) return "—";
  return o.overlord ? o.overlord : "none";
}

function fmtDelta(row: Row): string {
  if (!row.v1 || !row.v2) return "—";
  const d = row.v2.score - row.v1.score;
  return d > 0 ? `+${d}` : String(d);
}

// ---------------------------------------------------------------------------
// Reporting (pure, operates on collected rows)
// ---------------------------------------------------------------------------

function printPerCandidateTable(rows: Row[]): void {
  const cols: Array<[string, number]> = [
    ["candidate", 22],
    ["exp", 5],
    ["v1", 5],
    ["v2", 5],
    ["delta", 7],
    ["v1 overlord", 20],
    ["v2 overlord", 20],
  ];
  const header = cols.map(([h, w]) => pad(h, w)).join(" ");
  console.log("\nPer-candidate scores");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    if (row.error) {
      console.log(
        `${pad(row.name, 22)} ${pad(row.experience, 5)} ERROR: ${row.error}`,
      );
      continue;
    }
    const line = [
      pad(row.name, 22),
      pad(row.experience, 5),
      padLeft(fmtScore(row.v1), 5),
      padLeft(fmtScore(row.v2), 5),
      padLeft(fmtDelta(row), 7),
      pad(fmtOverlord(row.v1), 20),
      pad(fmtOverlord(row.v2), 20),
    ].join(" ");
    console.log(line);
  }
}

function printBandDistribution(rows: Row[]): void {
  const v1Counts = new Map<string, number>(BANDS.map((b) => [b.label, 0]));
  const v2Counts = new Map<string, number>(BANDS.map((b) => [b.label, 0]));
  let v1Total = 0;
  let v2Total = 0;
  for (const row of rows) {
    if (row.v1) {
      v1Counts.set(bandOf(row.v1.score), (v1Counts.get(bandOf(row.v1.score)) ?? 0) + 1);
      v1Total++;
    }
    if (row.v2) {
      v2Counts.set(bandOf(row.v2.score), (v2Counts.get(bandOf(row.v2.score)) ?? 0) + 1);
      v2Total++;
    }
  }

  console.log("\nBand distribution (count of candidates per score band)");
  const header = `${pad("band", 8)} ${padLeft("v1", 6)} ${padLeft("v2", 6)} ${padLeft("delta", 7)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const band of BANDS) {
    const a = v1Counts.get(band.label) ?? 0;
    const b = v2Counts.get(band.label) ?? 0;
    const d = b - a;
    console.log(
      `${pad(band.label, 8)} ${padLeft(String(a), 6)} ${padLeft(String(b), 6)} ${padLeft(d > 0 ? `+${d}` : String(d), 7)}`,
    );
  }
  console.log(
    `${pad("total", 8)} ${padLeft(String(v1Total), 6)} ${padLeft(String(v2Total), 6)}`,
  );
  // is_matchable (score >= 50) is the production gate; surface it explicitly.
  const v1Matchable = rows.filter((r) => r.v1 && r.v1.score >= 50).length;
  const v2Matchable = rows.filter((r) => r.v2 && r.v2.score >= 50).length;
  console.log(
    `\nmatchable (score >= 50): v1 ${v1Matchable}/${v1Total}  v2 ${v2Matchable}/${v2Total}`,
  );
}

function printOverlordRates(rows: Row[]): void {
  let v1Total = 0;
  let v1Triggered = 0;
  let v2Total = 0;
  let v2Triggered = 0;
  const v1Kinds = new Map<string, number>();
  const v2Kinds = new Map<string, number>();
  for (const row of rows) {
    if (row.v1) {
      v1Total++;
      if (row.v1.overlord) {
        v1Triggered++;
        v1Kinds.set(row.v1.overlord, (v1Kinds.get(row.v1.overlord) ?? 0) + 1);
      }
    }
    if (row.v2) {
      v2Total++;
      if (row.v2.overlord) {
        v2Triggered++;
        v2Kinds.set(row.v2.overlord, (v2Kinds.get(row.v2.overlord) ?? 0) + 1);
      }
    }
  }

  const rate = (n: number, total: number): string =>
    total === 0 ? "n/a" : `${((n / total) * 100).toFixed(1)}%`;

  console.log("\nOverlord trigger rates");
  console.log(`  v1: ${v1Triggered}/${v1Total} (${rate(v1Triggered, v1Total)})`);
  for (const [kind, count] of [...v1Kinds].sort()) {
    console.log(`      ${pad(kind, 22)} ${count}`);
  }
  console.log(`  v2: ${v2Triggered}/${v2Total} (${rate(v2Triggered, v2Total)})`);
  for (const [kind, count] of [...v2Kinds].sort()) {
    console.log(`      ${pad(kind, 22)} ${count}`);
  }
  // The senior-overlord gate: enable in prod only if v2's shadow rate is <~10%.
  if (v2Total > 0 && v2Triggered / v2Total >= 0.1) {
    console.log(
      "\n  GATE WARNING: v2 overlord trigger rate >= 10% — hold the senior-overlord rollout (see scripts/golden/README.md).",
    );
  }
}

// ---------------------------------------------------------------------------
// Evaluation (live; only reached when a valid folder is supplied)
// ---------------------------------------------------------------------------

async function evaluateOne(
  // runEvaluation is imported dynamically so the usage path never loads it.
  runEvaluation: typeof import("@/lib/evaluation-runner").runEvaluation,
  candidate: Candidate,
  version: "v1" | "v2",
): Promise<RunOutcome> {
  process.env.ETI_RUBRIC_VERSION = version;

  const resumeBase64 = readFileSync(candidate.resumePath).toString("base64");
  const result = await runEvaluation(
    {
      resumeBase64,
      githubUrl: candidate.meta.githubUrl ?? undefined,
      experience: candidate.meta.experience,
    },
    { opId: `calibrate-${candidate.name}-${version}` },
  );

  const stamped = result as typeof result & RubricStamp;
  return {
    score: result.score,
    overlord: result.overlord,
    rubricVersion:
      typeof stamped.rubric_version === "string"
        ? stamped.rubric_version
        : undefined,
  };
}

async function run(folder: string): Promise<void> {
  const candidates = discoverCandidates(folder);
  if (candidates.length === 0) {
    console.error(
      `No candidate subfolders with resume.pdf + meta.json found in: ${folder}`,
    );
    process.exit(1);
  }

  console.log(
    `Calibrating ${candidates.length} candidate(s) from ${resolve(folder)}`,
  );
  console.log("Running each candidate under rubric v1 and v2 (live LLM calls)...\n");

  // Dynamic import: keeps the no-args usage path free of heavy/side-effecting deps.
  const { runEvaluation } = await import("@/lib/evaluation-runner");

  const rows: Row[] = [];
  for (const candidate of candidates) {
    const row: Row = {
      name: candidate.name,
      experience: candidate.meta.experience,
    };
    try {
      // Sequential v1 then v2 so the per-call env swap is unambiguous and the
      // two runs never race on process.env.ETI_RUBRIC_VERSION.
      row.v1 = await evaluateOne(runEvaluation, candidate, "v1");
      row.v2 = await evaluateOne(runEvaluation, candidate, "v2");
      console.log(
        `  done ${pad(candidate.name, 22)} v1=${row.v1.score} v2=${row.v2.score}`,
      );
    } catch (e) {
      row.error = (e as Error).message;
      console.warn(`  FAILED ${candidate.name}: ${row.error}`);
    }
    rows.push(row);
  }

  printPerCandidateTable(rows);
  printBandDistribution(rows);
  printOverlordRates(rows);
  console.log("");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function loadEnv(): Promise<void> {
  // Mirror the .mjs diagnose scripts: prefer @next/env so .env.local is loaded
  // exactly as the app loads it; fall back to a tiny dotenv parser.
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
    let text: string;
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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  // No-args / missing-folder: print usage and exit 0 WITHOUT any network call.
  if (!arg) {
    printUsage();
    process.exit(0);
  }
  const folder = resolve(arg);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    console.error(`Folder not found or not a directory: ${arg}\n`);
    printUsage();
    process.exit(0);
  }

  await loadEnv();
  await run(folder);
}

main().catch((e) => {
  console.error(`calibrate-eti crashed: ${(e as Error)?.stack ?? e}`);
  process.exit(1);
});
