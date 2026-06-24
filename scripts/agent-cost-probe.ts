#!/usr/bin/env -S npx tsx
// scripts/agent-cost-probe.ts
//
// ADR-011 cost basis. Exercises the REAL agent turn (lib/agent/loop.ts ->
// router + synthesis + judge) for one message of each kind, against the live
// org roster, and prints the MEASURED Gemini token usage + dollar cost per
// kind (intercepted from the agent.gemini_usage log lines). No Slack, no
// Vercel log-scraping. Read-only: it runs runAgentTurn for the read/synthesis/
// move/outreach intents (which never write candidate or JD state) and, for
// create_intake, only routes (so it does NOT create a junk role).
//
// Usage:  npx tsx scripts/agent-cost-probe.ts
// Env:    reads .env.local (GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT_KEY, ...)

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
  const { routeMessage } = await import("@/lib/agent/router");
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
  const turn = (text: string) => runAgentTurn({ orgId, userId, text, surface: "slack" } as Parameters<typeof runAgentTurn>[0]);

  // The message of each kind. Names are real roster names so the router resolves them.
  const kinds: { kind: string; text: string; run: () => Promise<unknown> }[] = [
    { kind: "help", text: "hi, what can you do?", run: () => turn("hi, what can you do?") },
    { kind: "find", text: `who are my top candidates for ${someRoleTitle}?`, run: () => turn(`who are my top candidates for ${someRoleTitle}?`) },
    { kind: "describe", text: `tell me about ${one}`, run: () => turn(`tell me about ${one}`) },
    { kind: "explain", text: `explain ${one}'s flag and what to probe`, run: () => turn(`explain ${one}'s flag and what to probe`) },
    ...(two ? [{ kind: "compare", text: `compare ${one} and ${two} — who is stronger?`, run: () => turn(`compare ${one} and ${two} — who is stronger?`) }] : []),
    { kind: "move_stage", text: `move ${one} to interview`, run: () => turn(`move ${one} to interview`) },
    { kind: "draft_outreach", text: `draft outreach to ${one}`, run: () => turn(`draft outreach to ${one}`) },
    // create_intake: route only (running the full turn would create a real JD).
    { kind: "create_intake", text: "create an intake link for a senior backend engineer, remote, full-time", run: () => routeMessage("create an intake link for a senior backend engineer, remote, full-time", jobs, roster) },
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
  origLog("\n================ MEASURED COST PER MESSAGE KIND ================\n");
  const order = ["help", "find", "describe", "explain", "compare", "move_stage", "draft_outreach", "create_intake"];
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
  console.log = origLog;
  process.exit(0);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
