/**
 * QA: does Vendo's own agent loop emit OTel/Langfuse spans?
 *
 *   npx tsx scripts/qa-vendo-telemetry-ab.ts
 *
 * THE EXPERIMENT
 * One process, one registered OTel span processor, two code paths, one variable:
 *
 *   A) POST /api/vendo/threads   -> Vendo's own loop (nextVendoHandler)
 *   B) POST /api/vendo-agent     -> our BYO loop, which passes
 *                                   experimental_telemetry
 *
 * Both turns are driven with a unique marker string, then we ask the Langfuse
 * API which markers actually produced traces. Because the processor, the
 * process, the credentials and the model are identical across A and B, a
 * result of "B traced, A did not" isolates the cause to the missing
 * `experimental_telemetry` on Vendo's call sites and nothing else.
 *
 * This is the evidence for the upstream report. Do not patch anything until
 * this has been run and A comes back empty -- source inspection said the calls
 * lack the flag, but only this proves a host actually loses the spans.
 *
 * SETUP
 *   npm run dev
 * Env:
 *   QA_BASE_URL       default http://localhost:3000
 *   QA_ORG_A_USER     uid OR email of any signed-up user; the token is minted
 *   LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL
 */

import { loadEnvConfig } from "@next/env";
import { mintIdToken } from "./qa-id-token";

loadEnvConfig(process.cwd());

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const ACTOR = process.env.QA_ORG_A_USER;

/** Set once in main(), before any turn is driven. */
let TOKEN = "";
const LF_PUBLIC = process.env.LANGFUSE_PUBLIC_KEY;
const LF_SECRET = process.env.LANGFUSE_SECRET_KEY;
const LF_BASE = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";

/** Spans are batched and exported asynchronously; give the flush room. */
const SETTLE_MS = 12_000;

const stamp = Date.now();
const MARKER_VENDO = `abtest-vendo-${stamp}`;
const MARKER_BYO = `abtest-byo-${stamp}`;

function preflight(): boolean {
  const missing = [
    ["QA_ORG_A_USER", ACTOR],
    ["LANGFUSE_PUBLIC_KEY", LF_PUBLIC],
    ["LANGFUSE_SECRET_KEY", LF_SECRET],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`Missing env: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

/** Path A -- Vendo's own loop, through its wire. */
async function turnViaVendo(marker: string): Promise<number> {
  const res = await fetch(`${BASE}/api/vendo/threads`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    // `id` is REQUIRED (harnesses/src/transcript-rules.ts validateMessage);
    // omitting it fails at validation before the agent ever runs.
    body: JSON.stringify({
      message: {
        id: `msg_${marker}`,
        role: "user",
        parts: [{ type: "text", text: `Say the word ${marker} back to me.` }],
      },
    }),
  });
  await res.text(); // drain the stream so the turn completes
  return res.status;
}

/** Path B -- our loop, with experimental_telemetry enabled. */
async function turnViaByo(marker: string): Promise<number> {
  const res = await fetch(`${BASE}/api/vendo-agent`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Say the word ${marker} back to me.` }],
    }),
  });
  await res.text();
  return res.status;
}

/**
 * How many traces landed since `sinceIso`.
 *
 * COUNTING, not string-matching. An earlier version of this script searched the
 * trace list for the prompt marker and reported false negatives: a streamed
 * turn lands with `name: ""` and `input: null`, so the text never appears in
 * the list response even though the trace exists. Each path is therefore
 * measured in its own time window instead.
 */
async function countTracesSince(sinceIso: string): Promise<number> {
  const auth = Buffer.from(`${LF_PUBLIC}:${LF_SECRET}`).toString("base64");
  const res = await fetch(
    `${LF_BASE}/api/public/traces?fromTimestamp=${encodeURIComponent(sinceIso)}&limit=100`,
    { headers: { authorization: `Basic ${auth}` } }
  );
  if (!res.ok) {
    throw new Error(`Langfuse API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: unknown[] };
  return body.data?.length ?? 0;
}

async function main(): Promise<void> {
  if (!preflight()) process.exit(1);

  const since = new Date(Date.now() - 60_000).toISOString();
  console.log(`Vendo telemetry A/B\n  host:     ${BASE}\n  langfuse: ${LF_BASE}\n`);

  TOKEN = await mintIdToken(ACTOR!);
  console.log(`  minted an ID token for ${ACTOR}\n`);

  const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS));

  // Each path gets its OWN window, so a trace can only be attributed to the
  // path that was running when it appeared.
  const windowA = new Date(Date.now() - 2_000).toISOString();
  console.log("  A) driving a turn through Vendo's own loop  (/api/vendo/threads)");
  const statusA = await turnViaVendo(MARKER_VENDO);
  console.log(`     HTTP ${statusA}, waiting ${SETTLE_MS / 1000}s for export...`);
  await settle();
  const tracesA = await countTracesSince(windowA);

  const windowB = new Date(Date.now() - 2_000).toISOString();
  console.log("  B) driving a turn through our BYO loop      (/api/vendo-agent)");
  const statusB = await turnViaByo(MARKER_BYO);
  console.log(`     HTTP ${statusB}, waiting ${SETTLE_MS / 1000}s for export...`);
  await settle();
  const tracesB = await countTracesSince(windowB);

  if (statusA >= 400 && statusB >= 400) {
    console.error("\nBoth turns failed -- fix the host before reading anything into the traces.");
    process.exit(1);
  }

  console.log(`\n  traces in window A (Vendo loop): ${tracesA}`);
  console.log(`  traces in window B (BYO loop):   ${tracesB}`);

  const sawVendo = tracesA > 0;
  const sawByo = tracesB > 0;
  void since;

  console.log("\n  results");
  console.log(`    Vendo own loop traced : ${sawVendo ? "YES" : "NO"}`);
  console.log(`    BYO loop traced       : ${sawByo ? "YES" : "NO"}`);

  if (!sawByo) {
    console.log(
      "\n  INCONCLUSIVE. The BYO control did not trace either, so the wiring itself\n" +
        "  is the suspect -- check the keys, and that `after(flushLangfuse)` runs.\n" +
        "  Do not report anything upstream off this run."
    );
    process.exit(1);
  }

  if (sawByo && !sawVendo) {
    console.log(
      "\n  CONFIRMED. Identical process and processor; the only difference is\n" +
        "  experimental_telemetry. Vendo's loop loses its spans silently.\n" +
        "  This is the evidence for the upstream report."
    );
    return;
  }

  console.log(
    "\n  Both paths traced -- the gap does NOT reproduce. Something upstream of\n" +
      "  the source read is wrong; retract the finding before mailing anyone."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
