#!/usr/bin/env -S npx tsx
// scripts/agent-runs-tail.ts — quick diagnostic: print the most recent agent_runs
// with the resolved actor + mappedFromEmail, to verify Slack->org auth resolution.
// Usage: npx tsx scripts/agent-runs-tail.ts
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
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const db = getAdminDb();
  const snap = await db.collection("agent_runs").orderBy("createdAt", "desc").limit(25).get();
  console.log(`Most recent ${snap.size} agent_runs:\n`);
  for (const d of snap.docs) {
    const x = d.data() as Record<string, unknown>;
    const det = (x.detail ?? {}) as Record<string, unknown>;
    const when = (x.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? "?";
    console.log(
      `${when}  kind=${x.kind}  slackUser=${x.slackUserId ?? "-"}  uid=${String(x.userId).slice(0, 8)}…  ` +
        `mappedFromEmail=${det.mappedFromEmail ?? "-"}  intent/action=${det.intent ?? det.action ?? "-"}`
    );
  }
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
