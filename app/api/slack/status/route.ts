import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { getInstallationByOrg } from "@/lib/slack/installations";

/**
 * Report whether the caller's org has a live Slack install (ADR-010 Phase 1).
 *
 * The ConnectSlackCard used to infer "connected" only from the post-OAuth
 * `?slack=connected` query param, so navigating away and back reset the UI to
 * "Connect Slack" even though the install was intact. This endpoint reads the
 * real state (`slack_installations` keyed by org) so the card can reflect it on
 * every mount. We never return the bot token — only connected + workspace name.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireOrgMember(req.headers);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const inst = await getInstallationByOrg(ctx.orgId);
  return NextResponse.json({
    connected: inst !== null,
    teamName: inst?.teamName ?? null,
  });
}
