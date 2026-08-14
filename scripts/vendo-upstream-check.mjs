#!/usr/bin/env node
/**
 * Vendo upstream watch — "what changed, and does it kill our findings?"
 *
 * Yousef ships 50+ commits a day, so a finding can be fixed, moved or
 * superseded between one conversation and the next. That already happened once:
 * the localStorage fix was built, tested, and made obsolete by a contract line
 * upstream before it was ever pushed.
 *
 * Run:
 *   node scripts/vendo-upstream-check.mjs <path-to-vendo-fork>
 *
 * It fetches upstream, prints the merged PR titles since the last recorded
 * check, and then re-runs the probes that decide whether each open finding
 * still exists. The last-seen commit is stored in .vendo-upstream-seen beside
 * this script, so each run reports only the delta.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEEN_FILE = join(HERE, ".vendo-upstream-seen");

const repo = process.argv[2];
if (repo === undefined || !existsSync(join(repo, ".git"))) {
  console.error("usage: node scripts/vendo-upstream-check.mjs <path-to-vendo-fork>");
  console.error("(the fork clone with an `upstream` remote pointing at runvendo/vendo)");
  process.exit(1);
}

const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

/**
 * Each probe is a claim we are relying on, phrased so a MATCH means the finding
 * is still real. When one flips, the finding is fixed or moved — go look before
 * saying anything about it out loud.
 */
const PROBES = [
  {
    finding: "PR #1067 — no OTel GenAI spans",
    expect: "absent",
    args: ["grep", "-l", "experimental_telemetry", "upstream/main", "--", "packages/"],
    note: "If this ever returns files, telemetry landed upstream and the PR is done.",
  },
  {
    finding: "Dead thread — reasoning shed first",
    expect: "present",
    args: ["grep", "-l", "shedToBudget", "upstream/main", "--", "packages/harnesses/src/vendo/loop.ts"],
    note: "Gone or renamed = the compaction path changed; re-read before claiming the mechanism.",
  },
  {
    finding: "No-storage rule is unenforced",
    expect: "absent",
    args: ["grep", "-l", "localStorage", "upstream/main", "--", "packages/apps/src/server/checking"],
    note: "A hit means they added the static check — which is the pitch's proposal #1, so it would be taken.",
  },
  {
    finding: "No style/palette gate on islands",
    expect: "absent",
    args: ["grep", "-lE", "#[0-9a-fA-F]{6}|hexColour|paletteViolations", "upstream/main", "--", "packages/apps/src/server/checking/islands.ts"],
    note: "A hit means on-brand became a real gate and pitch proposal #1 is spent.",
  },
];

console.log("fetching upstream…");
git("fetch", "upstream", "--quiet");

const head = git("rev-parse", "--short", "upstream/main");
const seen = existsSync(SEEN_FILE) ? readFileSync(SEEN_FILE, "utf8").trim() : "";

console.log(`\nupstream head : ${head}   ${git("log", "-1", "--format=%s", "upstream/main")}`);

if (seen === "") {
  console.log("last seen     : (none recorded — first run)");
} else if (seen === git("rev-parse", "upstream/main")) {
  console.log("last seen     : same commit — nothing new since the last check.\n");
} else {
  const count = git("rev-list", "--count", `${seen}..upstream/main`);
  console.log(`last seen     : ${seen.slice(0, 9)}  →  ${count} new commits\n`);
  const titles = git("log", `${seen}..upstream/main`, "--format=%s")
    .split("\n")
    .filter((line) => line.includes("(#"));
  console.log(`--- ${titles.length} merged PRs since ---`);
  for (const title of titles) console.log(`  ${title}`);
}

console.log("\n--- are our findings still real? ---");
for (const probe of PROBES) {
  let hits = "";
  try {
    hits = git(...probe.args);
  } catch {
    hits = ""; // git grep exits 1 on no match
  }
  const found = hits !== "";
  const stillReal = probe.expect === "absent" ? !found : found;
  console.log(`\n${stillReal ? "STILL REAL " : ">> CHANGED "} ${probe.finding}`);
  if (!stillReal) {
    console.log(`             ${probe.note}`);
    if (found) for (const file of hits.split("\n").slice(0, 4)) console.log(`             ${file}`);
  }
}

writeFileSync(SEEN_FILE, git("rev-parse", "upstream/main"));
console.log(`\nrecorded ${head} as last seen. Update docs/vendo-upstream-delta.md with anything that moved.`);
