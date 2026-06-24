#!/usr/bin/env -S npx tsx
// scripts/diagnose-slack-actor.ts — pinpoint why a Slack user does/doesn't map to
// an in-org actor, WITHOUT printing the email value (PII). Reports booleans only.
// Usage: npx tsx scripts/diagnose-slack-actor.ts <slackUserId>
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
  const slackUserId = process.argv[2];
  if (!slackUserId) throw new Error("usage: diagnose-slack-actor.ts <slackUserId>");
  await loadEnv();

  const { getAdminDb, getAdminAuth } = await import("@/lib/firebase-admin");
  const { getOrgRole } = await import("@/lib/org");
  const db = getAdminDb();

  const instSnap = await db.collection("slack_installations").limit(1).get();
  if (instSnap.empty) throw new Error("no installation");
  const inst = instSnap.docs[0].data() as Record<string, unknown>;
  const botToken = inst.botToken as string;
  const orgId = inst.orgId as string;
  console.log(`installation team=${instSnap.docs[0].id} org=${orgId} installerUid=${String(inst.installerUid).slice(0, 8)}…`);
  console.log(`installerSlackUserId stored? ${"installerSlackUserId" in inst ? inst.installerSlackUserId : "NO — field absent"}`);

  // Step 1: users.info — does the bot have users:read.email and get an email back?
  const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    user?: { profile?: { email?: string }; is_admin?: boolean };
  };
  console.log(`\n[1] users.info ok=${data.ok} error=${data.error ?? "-"}`);
  const email = data.user?.profile?.email ?? null;
  console.log(`[1] email present in profile? ${email ? "yes" : "NO"}  (domain: ${email ? email.split("@")[1] : "-"})`);

  if (!email) {
    console.log("\n=> FAILURE POINT: no email from users.info. Likely the users:read.email scope is missing,");
    console.log("   or the user has no email on their Slack profile. Add the scope + reinstall to map by email.");
    process.exit(0);
  }

  // Step 2: Firebase user by that email?
  const user = await getAdminAuth().getUserByEmail(email).catch(() => null);
  console.log(`\n[2] Firebase user for that email? ${user ? `yes (uid ${user.uid.slice(0, 8)}…)` : "NO"}`);
  if (!user) {
    console.log("\n=> FAILURE POINT: Slack email has no matching EigenWork account. The user's Slack email");
    console.log("   differs from their EigenWork login, OR they have no account. Mapping can't succeed by email.");
    process.exit(0);
  }

  // Step 3: org membership?
  const role = await getOrgRole(orgId, user.uid).catch(() => null);
  console.log(`[3] getOrgRole(org, uid) => ${role ?? "NO ROLE"}`);
  console.log(
    role
      ? "\n=> MAPS CLEANLY. This user would resolve to a real in-org actor (no installer fallback needed)."
      : "\n=> FAILURE POINT: account exists but is not a member of the installation's org."
  );
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
