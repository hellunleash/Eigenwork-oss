#!/usr/bin/env -S npx tsx
// scripts/backfill-installer-slackid.ts
//
// One-shot: stamp `installerSlackUserId` on a pre-existing slack_installations doc
// that was created before the field existed. New OAuth installs capture it
// automatically (oauth.v2.access authed_user.id); only installs that predate the
// fail-closed auth change (ADR-010 guardrail 2 hardening) need this.
//
// Usage:
//   npx tsx scripts/backfill-installer-slackid.ts <teamId> <slackUserId>          (dry run)
//   npx tsx scripts/backfill-installer-slackid.ts <teamId> <slackUserId> --apply  (writes)
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
  const [teamId, slackUserId] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!teamId || !slackUserId) throw new Error("usage: backfill-installer-slackid.ts <teamId> <slackUserId> [--apply]");
  await loadEnv();

  const { getAdminDb } = await import("@/lib/firebase-admin");
  const db = getAdminDb();
  const ref = db.collection("slack_installations").doc(teamId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`no installation for team ${teamId}`);
  const d = snap.data() as Record<string, unknown>;
  console.log(`team=${teamId} org=${d.orgId} installerUid=${String(d.installerUid).slice(0, 8)}…`);
  console.log(`current installerSlackUserId: ${d.installerSlackUserId ?? "(absent)"}`);
  console.log(`target installerSlackUserId:  ${slackUserId}`);

  if (!apply) {
    console.log("\nDRY RUN — re-run with --apply to write.");
    process.exit(0);
  }
  await ref.set({ installerSlackUserId: slackUserId }, { merge: true });
  const after = (await ref.get()).data() as Record<string, unknown>;
  console.log(`\n✅ written. installerSlackUserId is now: ${after.installerSlackUserId}`);
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
