#!/usr/bin/env node
// scripts/diagnose-agent-trace.mjs
// Inspect agent traces (lib/agent/trace.ts) — one doc per agent turn in
// `agent_traces/{traceId}`, each holding the ordered spans (scope gate, each LLM
// step, each tool call, judge/jargon) plus rollups (cost, tokens, step count, tool
// error count, loop-detected).
//
// Usage:
//   node scripts/diagnose-agent-trace.mjs                 list the 20 most recent traces
//   node scripts/diagnose-agent-trace.mjs <traceId>        full span-by-span detail
//   node scripts/diagnose-agent-trace.mjs --stats [N]      distributions over the last N (default 200)
//   node scripts/diagnose-agent-trace.mjs --errors [N]     recent traces with a tool error or status=error

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

function fmtTime(ts) {
  if (!ts) return "<none>";
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
  return String(ts);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

async function main() {
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

  const arg = process.argv[2];

  // --- Single trace detail ---------------------------------------------------
  if (arg && !arg.startsWith("--")) {
    const snap = await db.collection("agent_traces").doc(arg).get();
    if (!snap.exists) {
      console.error(`trace ${arg} not found`);
      process.exit(1);
    }
    const d = snap.data();
    console.log(`traceId: ${snap.id}`);
    console.log(`when: ${fmtTime(d.createdAt)}`);
    console.log(`status: ${d.status}   loopDetected: ${d.loopDetected}`);
    console.log(`org: ${d.orgId}   user: ${d.userId}`);
    console.log(`text: ${JSON.stringify(d.text)}`);
    console.log(`duration: ${d.durationMs}ms   steps: ${d.stepCount}   tools: ${d.toolCallCount} (${d.toolErrorCount} errored)`);
    console.log(`tokens: in=${d.totalInputTokens} cached=${d.totalCachedTokens} out=${d.totalOutputTokens} thinking=${d.totalThinkingTokens}   cost: $${d.totalCostUsd}`);
    if (d.replyPreview) console.log(`reply: ${JSON.stringify(d.replyPreview)}`);
    console.log();
    console.log("--- spans ---");
    for (const s of d.spans ?? []) {
      const mark = s.ok ? "✓" : "✗";
      console.log(`${mark} [${pad(s.kind, 10)}] ${pad(s.name, 20)} ${pad(s.durationMs + "ms", 8)} ${s.model ?? ""}`);
      if (s.costUsd != null) console.log(`    tokens: in=${s.inputTokens} cached=${s.cachedTokens} out=${s.outputTokens} thinking=${s.thinkingTokens}  $${s.costUsd}`);
      if (s.toolArgs) console.log(`    args: ${JSON.stringify(s.toolArgs)}`);
      if (s.output) console.log(`    output: ${s.output}`);
      if (s.error) console.log(`    ERROR: ${s.error}`);
    }
    return;
  }

  // --- Aggregate stats ---------------------------------------------------------
  if (arg === "--stats") {
    const limit = Number(process.argv[3] ?? "200");
    const qs = await db.collection("agent_traces").orderBy("createdAt", "desc").limit(limit).get();
    if (qs.empty) {
      console.log("no traces found");
      return;
    }
    const docs = qs.docs.map((d) => d.data());
    const costs = docs.map((d) => d.totalCostUsd ?? 0).sort((a, b) => a - b);
    const steps = docs.map((d) => d.stepCount ?? 0).sort((a, b) => a - b);
    const durations = docs.map((d) => d.durationMs ?? 0).sort((a, b) => a - b);
    const toolCalls = docs.reduce((a, d) => a + (d.toolCallCount ?? 0), 0);
    const toolErrors = docs.reduce((a, d) => a + (d.toolErrorCount ?? 0), 0);
    const loops = docs.filter((d) => d.loopDetected).length;
    const byStatus = {};
    for (const d of docs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;

    console.log(`Stats over the last ${docs.length} traces:\n`);
    console.log("status breakdown:", JSON.stringify(byStatus));
    console.log(`loop detected: ${loops} (${((loops / docs.length) * 100).toFixed(1)}%)`);
    console.log(`tool error rate: ${toolErrors}/${toolCalls} (${toolCalls ? ((toolErrors / toolCalls) * 100).toFixed(1) : 0}%)`);
    console.log();
    console.log(`cost/task ($): min=${costs[0]?.toFixed(6)} p50=${quantile(costs, 0.5).toFixed(6)} p95=${quantile(costs, 0.95).toFixed(6)} max=${costs[costs.length - 1]?.toFixed(6)}`);
    console.log(`total spend in window: $${costs.reduce((a, c) => a + c, 0).toFixed(4)}`);
    console.log();
    console.log(`steps/task: min=${steps[0]} p50=${quantile(steps, 0.5)} p95=${quantile(steps, 0.95)} max=${steps[steps.length - 1]}`);
    console.log(`  (a rising p95/max = agents starting to loop/chain more than expected)`);
    console.log();
    console.log(`duration/task (ms): p50=${quantile(durations, 0.5)} p95=${quantile(durations, 0.95)} max=${durations[durations.length - 1]}`);
    return;
  }

  // --- Recent errors -----------------------------------------------------------
  if (arg === "--errors") {
    const limit = Number(process.argv[3] ?? "500");
    const qs = await db.collection("agent_traces").orderBy("createdAt", "desc").limit(limit).get();
    const flagged = qs.docs.filter((d) => {
      const v = d.data();
      return v.status === "error" || v.toolErrorCount > 0 || v.loopDetected;
    });
    if (flagged.length === 0) {
      console.log(`no flagged traces in the last ${limit}`);
      return;
    }
    console.log(pad("TRACE", 38) + pad("TIME", 26) + pad("STATUS", 10) + pad("TOOLERR", 8) + "LOOP");
    for (const doc of flagged) {
      const d = doc.data();
      console.log(pad(doc.id, 38) + pad(fmtTime(d.createdAt), 26) + pad(d.status, 10) + pad(d.toolErrorCount ?? 0, 8) + (d.loopDetected ? "yes" : ""));
    }
    return;
  }

  // --- Recent traces list --------------------------------------------------------
  const limit = 20;
  const qs = await db.collection("agent_traces").orderBy("createdAt", "desc").limit(limit).get();
  if (qs.empty) {
    console.log("no traces found — has the agent run since trace.ts was added?");
    return;
  }
  console.log(pad("TRACE", 38) + pad("TIME", 26) + pad("STATUS", 10) + pad("STEPS", 7) + pad("TOOLS", 7) + pad("$COST", 10) + pad("MS", 7) + "TEXT");
  for (const doc of qs.docs) {
    const d = doc.data();
    console.log(
      pad(doc.id, 38) +
        pad(fmtTime(d.createdAt), 26) +
        pad(d.status, 10) +
        pad(d.stepCount ?? 0, 7) +
        pad(d.toolCallCount ?? 0, 7) +
        pad("$" + (d.totalCostUsd ?? 0).toFixed(5), 10) +
        pad(d.durationMs ?? 0, 7) +
        (d.text ?? "").slice(0, 50)
    );
  }
  console.log("\nUse a traceId for full detail, --stats for distributions, --errors for flagged runs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
