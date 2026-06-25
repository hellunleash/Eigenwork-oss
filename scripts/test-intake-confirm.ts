#!/usr/bin/env -S npx tsx
// scripts/test-intake-confirm.ts — exercise the create_intake confirm-and-fill flow:
// create -> preview (no JD minted), edit by reply -> updated preview, then verify
// "create it" routes to confirm_intake and "cancel" to cancel_intake. Does NOT mint
// (no createJd) so no junk role is written; cleans up the throwaway draft doc.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    /* manual */
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
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

async function main(): Promise<void> {
  await loadEnv();
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes('"agent.gemini_usage"')) return;
    orig(...a);
  };

  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { runAgentTurn } = await import("@/lib/agent/loop");
  const { routeMessage } = await import("@/lib/agent/router");
  const { listJobs, getOrgCandidateRoster } = await import("@/lib/agent/data");
  const { loadPendingIntake } = await import("@/lib/agent/memory");

  const inst = (await getAdminDb().collection("slack_installations").limit(1).get()).docs[0].data() as Record<string, unknown>;
  const orgId = inst.orgId as string;
  const userId = inst.installerUid as string;
  const convoKey = `TEST:intake:${Date.now()}`;
  const turn = (text: string) => runAgentTurn({ orgId, userId, text, convoKey } as Parameters<typeof runAgentTurn>[0]);

  orig("\n👤 create an intake link for a senior backend engineer with Go and Postgres, remote");
  orig("🤖 " + (await turn("create an intake link for a senior backend engineer with Go and Postgres, remote")).text + "\n");

  orig("👤 require US work auth");
  orig("🤖 " + (await turn("require US work auth")).text + "\n");

  orig("👤 hybrid, 4+ years");
  orig("🤖 " + (await turn("hybrid, 4+ years")).text + "\n");

  // Verify confirm/cancel routing WITHOUT minting (don't execute the write).
  const [jobs, roster] = await Promise.all([listJobs(orgId), getOrgCandidateRoster(orgId)]);
  const pending = await loadPendingIntake(convoKey);
  const r1 = await routeMessage("create it", jobs, roster, [], pending);
  const r2 = await routeMessage("actually cancel that", jobs, roster, [], pending);
  orig(`routing with draft pending:  "create it" -> ${r1.intent}   ·   "actually cancel that" -> ${r2.intent}`);
  orig(`pending draft work_auth_us_required = ${pending?.work_auth_us_required}  ·  location_type = ${pending?.location_type}`);

  await getAdminDb().collection("agent_threads").doc(convoKey).delete().catch(() => {});
  console.log = orig;
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
