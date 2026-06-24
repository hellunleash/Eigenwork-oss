import { NextResponse } from "next/server";
import { verifyState } from "@/lib/slack/state";
import { slackOauthExchange } from "@/lib/slack/client";
import { saveInstallation } from "@/lib/slack/installations";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Slack OAuth callback (ADR-010 Phase 1). Slack redirects here (a top-level,
 * unauthenticated navigation) with ?code & ?state. The signed `state` carries the
 * installer's uid + orgId, so we link the workspace to the right org and store
 * the per-workspace bot token. Then bounce back to the dashboard with a status.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID = process.env.SLACK_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function back(status: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/user/dashboard?slack=${status}`);
}

export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return back("denied");
  const verified = verifyState(state);
  if (!code || !verified) return back("invalid");

  const redirectUri = `${APP_URL}/api/slack/oauth`;
  const result = await slackOauthExchange({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, code, redirectUri });
  if (!result.ok || !result.teamId || !result.botToken) {
    log("error", "slack.oauth_exchange_failed", { requestId, error: result.error });
    return back("error");
  }

  await saveInstallation({
    teamId: result.teamId,
    teamName: result.teamName ?? null,
    orgId: verified.orgId,
    botToken: result.botToken,
    botUserId: result.botUserId ?? null,
    installerUid: verified.uid,
    installerSlackUserId: result.authedUser ?? null,
  });
  log("info", "slack.installed", { requestId, teamId: result.teamId, orgId: verified.orgId });
  return back("connected");
}
