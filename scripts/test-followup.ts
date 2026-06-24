#!/usr/bin/env -S npx tsx
// scripts/test-followup.ts — reproduce the stateless-bot bug + verify the memory fix.
// Runs two turns sharing a convoKey: a find, then a follow-up "so both are same?".
// Without memory the 2nd routes to clarify ("who?"); with memory it should compare.
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
  // Silence the agent.gemini_usage noise for a clean transcript.
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes('"agent.gemini_usage"')) return;
    orig(...a);
  };

  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { runAgentTurn } = await import("@/lib/agent/loop");

  const instSnap = await getAdminDb().collection("slack_installations").limit(1).get();
  const inst = instSnap.docs[0].data() as Record<string, unknown>;
  const orgId = inst.orgId as string;
  const userId = inst.installerUid as string;

  const convoKey = `TEST:followup:${Date.now()}`; // throwaway thread
  const turn = (text: string) =>
    runAgentTurn({ orgId, userId, text, convoKey } as Parameters<typeof runAgentTurn>[0]);

  orig("\n=== WITH MEMORY (shared convoKey) ===\n");
  orig("👤 best candidate in software engineering role ?");
  orig("🤖 " + (await turn("best candidate in software engineering role ?")).text + "\n");
  orig("👤 so both are same ?");
  orig("🤖 " + (await turn("so both are same ?")).text + "\n");
  orig("👤 tell me more about the first one");
  orig("🤖 " + (await turn("tell me more about the first one")).text + "\n");

  orig("\n=== CONTROL: no memory (fresh convoKey, only the follow-up) ===\n");
  const freshKey = `TEST:control:${Date.now()}`;
  orig("👤 so both are same ?");
  orig(
    "🤖 " +
      (await runAgentTurn({ orgId, userId, text: "so both are same ?", convoKey: freshKey } as Parameters<typeof runAgentTurn>[0]))
        .text +
      "\n"
  );

  // Cleanup throwaway memory docs.
  await getAdminDb().collection("agent_threads").doc(convoKey).delete().catch(() => {});
  await getAdminDb().collection("agent_threads").doc(freshKey).delete().catch(() => {});
  console.log = orig;
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
