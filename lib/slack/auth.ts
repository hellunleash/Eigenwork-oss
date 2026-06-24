import { getAdminAuth } from "@/lib/firebase-admin";
import { getOrgRole } from "@/lib/org";
import { slackGetUserEmail } from "@/lib/slack/client";
import type { SlackInstallation } from "@/lib/slack/installations";

/**
 * Resolve a Slack user to an EigenWork (orgId, uid) actor (ADR-010 guardrail 2,
 * hardened — fail CLOSED). A Slack user is authorized ONLY if:
 *
 *   1. they are the installer, matched by the Slack user id captured at OAuth
 *      (`installerSlackUserId`) — the owner's stable identity, independent of
 *      email (their Slack profile email may not match their EigenWork login); or
 *   2. their Slack email maps to a Firebase user who is a MEMBER of the
 *      installation's org.
 *
 * Anyone else — an arbitrary workspace member, a guest, someone from another team
 * — resolves to `null` and gets NO access to org data. The previous version fell
 * back to the installer for unmapped users, which let any workspace member read
 * (and act on) the installer's candidate roster. That hole is closed here.
 */
export type SlackActor = { orgId: string; userId: string; mappedFromEmail: boolean };

export async function resolveSlackActor(
  installation: SlackInstallation,
  slackUserId: string
): Promise<SlackActor | null> {
  // 1. Installer, by their captured Slack id (works even when their email doesn't map).
  if (installation.installerSlackUserId && slackUserId === installation.installerSlackUserId) {
    return { orgId: installation.orgId, userId: installation.installerUid, mappedFromEmail: false };
  }

  // 2. Any other user must map email → uid → in-org membership.
  try {
    const email = await slackGetUserEmail(installation.botToken, slackUserId);
    if (email) {
      const user = await getAdminAuth()
        .getUserByEmail(email)
        .catch(() => null);
      if (user && (await getOrgRole(installation.orgId, user.uid))) {
        return { orgId: installation.orgId, userId: user.uid, mappedFromEmail: true };
      }
    }
  } catch {
    // fall through to deny
  }

  // 3. Fail closed.
  return null;
}
