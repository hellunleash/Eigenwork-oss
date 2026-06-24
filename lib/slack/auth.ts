import { getAdminAuth } from "@/lib/firebase-admin";
import { getOrgRole } from "@/lib/org";
import { slackGetUserEmail } from "@/lib/slack/client";
import type { SlackInstallation } from "@/lib/slack/installations";

/**
 * Resolve a Slack user to an EigenWork (orgId, uid) actor (ADR-010 guardrail 2).
 *
 * Maps slack user → email (users.info) → Firebase uid, and REQUIRES that uid be a
 * member of the installation's org (no cross-org access). Falls back to the
 * installer when the Slack user can't be mapped or isn't an org member, so every
 * action still has a known, in-org actor for the audit log.
 */
export type SlackActor = { orgId: string; userId: string; mappedFromEmail: boolean };

export async function resolveSlackActor(
  installation: SlackInstallation,
  slackUserId: string
): Promise<SlackActor> {
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
    // fall through to the installer
  }
  return { orgId: installation.orgId, userId: installation.installerUid, mappedFromEmail: false };
}
