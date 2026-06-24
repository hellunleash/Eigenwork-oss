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
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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
  };
}
