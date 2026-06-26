import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Slack workspace install records (ADR-010 Phase 1).
 *
 * `slack_installations/{team_id}` links a Slack workspace to an EigenWork org and
 * holds the per-workspace bot token captured at OAuth time. This is the tenant
 * routing key: an inbound event carries team_id → we resolve the owning org.
 *
 * NOTE: botToken is stored in Firestore (encrypted at rest by Google). A
 * follow-up should wrap it with app-level encryption like the planned ats_links
 * secret store — flagged, not yet implemented.
 */
export type SlackInstallation = {
  teamId: string;
  teamName: string | null;
  orgId: string;
  botToken: string;
  botUserId: string | null;
  installerUid: string;
  /** The installing user's Slack user id (from oauth.v2.access authed_user.id).
   *  Authorizes the installer as themselves independent of email — their Slack
   *  profile email may not match their EigenWork login (guardrail 2, fail-closed). */
  installerSlackUserId: string | null;
};

const COLLECTION = "slack_installations";

export async function saveInstallation(inst: SlackInstallation): Promise<void> {
  const db = getAdminDb();
  await db.collection(COLLECTION).doc(inst.teamId).set(
    {
      teamId: inst.teamId,
      teamName: inst.teamName,
      orgId: inst.orgId,
      botToken: inst.botToken,
      botUserId: inst.botUserId,
      installerUid: inst.installerUid,
      installerSlackUserId: inst.installerSlackUserId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Find the install for an org (reverse of getInstallation). Used by proactive
 *  notifications that start from a JD/org, not a Slack event. One install per org
 *  today; first match wins. */
export async function getInstallationByOrg(orgId: string): Promise<SlackInstallation | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).where("orgId", "==", orgId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? getInstallation(doc.id) : null;
}

export async function getInstallation(teamId: string): Promise<SlackInstallation | null> {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(teamId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  if (typeof d.orgId !== "string" || typeof d.botToken !== "string") return null;
  return {
    teamId,
    teamName: typeof d.teamName === "string" ? d.teamName : null,
    orgId: d.orgId,
    botToken: d.botToken,
    botUserId: typeof d.botUserId === "string" ? d.botUserId : null,
    installerUid: typeof d.installerUid === "string" ? d.installerUid : "",
    installerSlackUserId: typeof d.installerSlackUserId === "string" ? d.installerSlackUserId : null,
  };
}
