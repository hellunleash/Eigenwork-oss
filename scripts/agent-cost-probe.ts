#!/usr/bin/env -S npx tsx
// scripts/agent-cost-probe.ts
//
// ADR-011/012 cost basis. Exercises the REAL agent turn (lib/agent/loop.ts ->
// the bounded tool-calling loop, AGENT_MODE=tools) for one message of several
// scenarios, against the live org roster, and prints the MEASURED Gemini token
// usage + dollar cost per scenario (intercepted from the agent.gemini_usage log
// lines: the flash-lite scope gate + each gemini-2.5-flash tool-loop step). No
// Slack, no Vercel log-scraping.
//
// Read/PROPOSE-only: in the loop, writes (move_stage / create_intake /
// draft_outreach) only PROPOSE a confirm card — they never mutate — so this runs
// them as full turns safely (no junk role, no stage change). A bare greeting
// ("help") short-circuits to deterministic help text with ZERO LLM calls, so it
// shows no cost row.
//
// Usage:  npx tsx scripts/agent-cost-probe.ts
// Env:    reads .env.local (GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT_KEY, ...);
//         forces AGENT_MODE=tools regardless of ambient env.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    // fall through to manual .env parse
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const rawLine of readFileSync(p, "utf8").split(/\r?\n/)) {
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

type Sample = { kind: string; label: string; inputTokens: number; outputTokens: number; costUsd: number };

async function main(): Promise<void> {
  await loadEnv();
  process.env.AGENT_MODE = "tools"; // measure the tool-calling loop regardless of ambient env

  // Intercept the agent.gemini_usage log lines (server-logger uses console.log
  // for info level) and attribute each to the kind currently under test.
  const samples: Sample[] = [];
  let currentKind = "";
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const s = typeof args[0] === "string" ? args[0] : "";
    if (s.includes('"agent.gemini_usage"')) {
      try {
        const o = JSON.parse(s) as { label: string; inputTokens: number; outputTokens: number; costUsd: number };
        samples.push({ kind: currentKind, label: o.label, inputTokens: o.inputTokens, outputTokens: o.outputTokens, costUsd: o.costUsd });
      } catch {
        /* not the json we want */
      }
      return; // swallow the raw line; we print a clean table at the end
    }
    origLog(...args);
  };

  // Lazy-import after env load so firebase-admin sees the service account.
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { runAgentTurn } = await import("@/lib/agent/loop");
  const { listJobs, getOrgCandidateRoster } = await import("@/lib/agent/data");

  // Discover the connected org from slack_installations (the org the live bot serves).
  const db = getAdminDb();
  const instSnap = await db.collection("slack_installations").limit(5).get();
  if (instSnap.empty) throw new Error("no slack_installations found — connect Slack first or pass an orgId");
  const orgIds = Array.from(new Set(instSnap.docs.map((d) => d.data().orgId as string).filter(Boolean)));
  origLog(`orgs from slack_installations: ${orgIds.join(", ")}`);

  // Pick the org that actually has a roster; prefer one with a 2+ candidate role.
  let orgId = orgIds[0];
  let jobs = await listJobs(orgId);
  let roster = await getOrgCandidateRoster(orgId);
  for (const oid of orgIds) {
    const r = await getOrgCandidateRoster(oid);
    if (r.length > roster.length) {
      orgId = oid;
      jobs = await listJobs(oid);
      roster = r;
    }
  }
  origLog(`chosen org: ${orgId} — ${jobs.length} jobs, ${roster.length} roster candidates`);

  if (roster.length === 0) throw new Error("chosen org has an empty roster — nothing to test");

  // Find a role with >=2 candidates for the compare test (prefer software engineer).
  const byJob = new Map<string, typeof roster>();
  for (const c of roster) byJob.set(c.jobId, [...(byJob.get(c.jobId) ?? []), c]);
  let pairJobId = "";
  for (const [jid, cs] of byJob) {
    if (cs.length >= 2) {
      const title = jobs.find((j) => j.id === jid)?.title ?? "";
      if (/software\s*engineer/i.test(title)) { pairJobId = jid; break; }
      if (!pairJobId) pairJobId = jid;
    }
  }
  const pair = pairJobId ? byJob.get(pairJobId)! : [];
  const one = (pair[0] ?? roster[0]).name;
  const two = pair[1]?.name;
  const someRoleTitle = jobs[0]?.title || "engineer";

  origLog(`primary candidate: "${one}"${two ? `; compare pair: "${one}" vs "${two}"` : "  (no 2-candidate role found — compare will be skipped)"}`);
  origLog("");

  const userId = instSnap.docs[0].data().installerUid as string;
  // Each scenario gets its own convoKey so the loop can carry tool results across
  // its own steps; names are real roster names so the loop's tools resolve them.
  const turn = (text: string, convoKey: string) =>
    runAgentTurn({ orgId, userId, text, convoKey } as Parameters<typeof runAgentTurn>[0]);

  // One message per scenario. In tools mode each is a scope-gate + a bounded loop;
  // writes propose a confirm card and never mutate, so all are safe as full turns.
  const stamp = Date.now();
  const kinds: { kind: string; text: string; run: () => Promise<unknown> }[] = [
    { kind: "help", text: "hi, what can you do?", run: () => turn("hi, what can you do?", `PROBE:help:${stamp}`) },
    { kind: "list_roles", text: "how many roles do I have and which are ready to shortlist?", run: () => turn("how many roles do I have and which are ready to shortlist?", `PROBE:roles:${stamp}`) },
    { kind: "find", text: `who are my top candidates for ${someRoleTitle}?`, run: () => turn(`who are my top candidates for ${someRoleTitle}?`, `PROBE:find:${stamp}`) },
    { kind: "describe", text: `tell me about ${one}`, run: () => turn(`tell me about ${one}`, `PROBE:describe:${stamp}`) },
    { kind: "explain", text: `explain ${one}'s flag and what to probe`, run: () => turn(`explain ${one}'s flag and what to probe`, `PROBE:explain:${stamp}`) },
    ...(two ? [{ kind: "compare", text: `compare ${one} and ${two} — who is stronger?`, run: () => turn(`compare ${one} and ${two} — who is stronger?`, `PROBE:compare:${stamp}`) }] : []),
    { kind: "move_stage", text: `move ${one} to interview`, run: () => turn(`move ${one} to interview`, `PROBE:move:${stamp}`) },
    { kind: "draft_outreach", text: `draft outreach to ${one}`, run: () => turn(`draft outreach to ${one}`, `PROBE:outreach:${stamp}`) },
    // create_intake: in tools mode this PROPOSES a confirm card (mint is the button
    // click), so a full turn is safe — it never creates a junk role.
    { kind: "create_intake", text: "create an intake link for a senior backend engineer, remote, full-time, no work auth needed, 50 applicants", run: () => turn("create an intake link for a senior backend engineer, remote, full-time, no work auth needed, 50 applicants", `PROBE:intake:${stamp}`) },
  ];

  for (const k of kinds) {
    currentKind = k.kind;
    try {
      await k.run();
    } catch (e) {
      origLog(`  [${k.kind}] ERROR: ${(e as Error).message}`);
    }
  }

  // ---- Report ----
  origLog("\n========== MEASURED COST PER SCENARIO (AGENT_MODE=tools) ==========\n");
  const order = ["help", "list_roles", "find", "describe", "explain", "compare", "move_stage", "draft_outreach", "create_intake"];
  const seen = new Set(samples.map((s) => s.kind));
  const rows: { kind: string; calls: string; inTok: number; outTok: number; cost: number }[] = [];
  for (const kind of order) {
    if (!seen.has(kind)) continue;
    const ks = samples.filter((s) => s.kind === kind);
    const inTok = ks.reduce((a, s) => a + s.inputTokens, 0);
    const outTok = ks.reduce((a, s) => a + s.outputTokens, 0);
    const cost = ks.reduce((a, s) => a + s.costUsd, 0);
    const calls = ks.map((s) => s.label.replace(/^synthesis_/, "syn:")).join(" + ");
    rows.push({ kind, calls, inTok, outTok, cost });
  }

  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  origLog(pad("KIND", 16) + pad("LLM CALLS", 34) + pad("IN", 8) + pad("OUT", 8) + pad("$ / MSG", 12) + "MSGS / $1");
  origLog("-".repeat(94));
  for (const r of rows) {
    const perDollar = r.cost > 0 ? Math.floor(1 / r.cost).toLocaleString() : "∞";
    origLog(
      pad(r.kind, 16) +
        pad(r.calls, 34) +
        pad(String(r.inTok), 8) +
        pad(String(r.outTok), 8) +
        pad("$" + r.cost.toFixed(6), 12) +
        perDollar
    );
  }
  origLog("-".repeat(94));

  // Per-label averages (the reusable cost primitives).
  origLog("\nPer-call averages by label:");
  const labels = Array.from(new Set(samples.map((s) => s.label)));
  for (const label of labels) {
    const ls = samples.filter((s) => s.label === label);
    const avgIn = Math.round(ls.reduce((a, s) => a + s.inputTokens, 0) / ls.length);
    const avgOut = Math.round(ls.reduce((a, s) => a + s.outputTokens, 0) / ls.length);
    const avgCost = ls.reduce((a, s) => a + s.costUsd, 0) / ls.length;
    origLog(`  ${pad(label, 20)} n=${ls.length}  in≈${avgIn}  out≈${avgOut}  $${avgCost.toFixed(6)}/call`);
  }

  const totalCost = samples.reduce((a, s) => a + s.costUsd, 0);
  origLog(`\nTotal spend for this probe run: $${totalCost.toFixed(6)} across ${samples.length} Gemini calls.`);

  // Clean up the throwaway per-scenario memory docs (keys all carry this stamp).
  for (const slug of ["help", "roles", "find", "describe", "explain", "compare", "move", "outreach", "intake"]) {
    await db.collection("agent_threads").doc(`PROBE:${slug}:${stamp}`).delete().catch(() => {});
  }
  console.log = origLog;
  process.exit(0);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
