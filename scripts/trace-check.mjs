/**
 * "What did that test actually trace?" — run this right after a Vendo prompt.
 *
 * Langfuse ingestion is an ASYNC QUEUE. A trace is not queryable the instant
 * the span flushes: the smoke test's 4-second wait reported NO for a trace that
 * arrived at +40s, which reads as "tracing is broken" when tracing is fine.
 * This polls instead of guessing, and says which lane each trace came from so a
 * test result can be pasted straight into docs/vendo-trace-test-log.md.
 *
 *   node scripts/trace-check.mjs            # last 30 minutes
 *   node scripts/trace-check.mjs 120        # last 120 minutes
 */
import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

const MINUTES = Number(process.argv[2] ?? 30);
const base = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;

if (!publicKey || !secretKey) {
  console.error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY missing from .env.local");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

/** Which of our lanes a trace belongs to. The wire lane is the one that exists
 *  only because a generated app's tool call is NOT a model call. */
function lane(name) {
  const n = String(name ?? "");
  if (n.includes("vendo.wire")) return "WIRE   (app -> host tool call)";
  if (n.includes("vendo.apps.generate")) return "MODEL  (app generation)";
  if (n.includes("vendo.apps.repair")) return "MODEL  (repair lane)";
  if (n.includes("vendo.agent.turn")) return "MODEL  (agent turn)";
  if (n.includes("otel-smoke")) return "smoke test";
  return "other";
}

const since = new Date(Date.now() - MINUTES * 60_000).toISOString();
const url = `${base}/api/public/traces?fromTimestamp=${encodeURIComponent(since)}&limit=100`;

console.log(`querying ${base} for the last ${MINUTES} minutes…\n`);

let rows = [];
// Poll: ingestion lag is normal and varies. Stop as soon as anything shows up.
for (let attempt = 1; attempt <= 6; attempt += 1) {
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) {
    console.error(`read failed: HTTP ${res.status} — check the keys match this host's project`);
    process.exit(1);
  }
  rows = (await res.json()).data ?? [];
  if (rows.length > 0) break;
  if (attempt < 6) {
    process.stdout.write(`  nothing yet (attempt ${attempt}/6), waiting 10s…\r`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

if (rows.length === 0) {
  console.log("No traces in that window.\n");
  console.log("Before concluding tracing is broken, check in this order:");
  console.log("  1. did the dev server restart after the patch/env change?");
  console.log("  2. VENDO_OTEL_TRACING is not 0/false");
  console.log("  3. the run really happened inside that window — widen it: node scripts/trace-check.mjs 120");
  process.exit(0);
}

console.log(`${rows.length} trace(s):\n`);
const counts = new Map();
for (const t of rows) {
  const l = lane(t.name);
  counts.set(l, (counts.get(l) ?? 0) + 1);
  const cost = t.totalCost ?? t.calculatedTotalCost;
  const parts = [
    new Date(t.timestamp).toLocaleTimeString(),
    l.padEnd(30),
    JSON.stringify(t.name ?? ""),
  ];
  if (typeof t.latency === "number") parts.push(`${t.latency.toFixed(1)}s`);
  if (typeof cost === "number") parts.push(`$${cost.toFixed(4)}`);
  console.log("  " + parts.join("  "));
}

console.log("\nby lane:");
for (const [l, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${l}`);

const hasWire = counts.has("WIRE   (app -> host tool call)");
const hasGen = [...counts.keys()].some((k) => k.startsWith("MODEL"));
console.log("");
if (hasGen && hasWire) {
  console.log("Both lanes captured — the generation span shows the schema the model saw,");
  console.log("the wire span shows the call it emitted. That pair is the causal chain.");
} else if (hasGen) {
  console.log("Model lane only. No wire spans yet — the app has not called a tool at render");
  console.log("time, or the call did not go through /api/vendo.");
} else if (hasWire) {
  console.log("Wire lane only. The model call was not traced — check the patch is applied:");
  console.log("  grep -c VENDO_OTEL_TRACING node_modules/@vendoai/agent/dist/agent.js");
}
