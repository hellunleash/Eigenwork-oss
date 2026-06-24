/**
 * Minimal Slack Web API client (fetch-based, no SDK dependency).
 *
 * Covers exactly what the agent needs: post a message, look up a user's email
 * (for the slack-user → org actor mapping), and the OAuth code exchange.
 */
const SLACK_API = "https://slack.com/api";

export async function slackPostMessage(
  botToken: string,
  args: { channel: string; text?: string; blocks?: unknown[]; thread_ts?: string }
): Promise<void> {
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(args),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(`slack_postMessage_failed: ${data.error ?? res.status}`);
}

export async function slackGetUserEmail(botToken: string, userId: string): Promise<string | null> {
  const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: { profile?: { email?: string } };
  };
  if (!data.ok) return null;
  const email = data.user?.profile?.email;
  return typeof email === "string" ? email : null;
}

export type SlackOauthResult = {
  ok: boolean;
  teamId?: string;
  teamName?: string;
  botToken?: string;
  botUserId?: string;
  authedUser?: string;
  error?: string;
};

export async function slackOauthExchange(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<SlackOauthResult> {
  const body = new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    access_token?: string;
    bot_user_id?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string };
  };
  if (!data.ok) return { ok: false, error: data.error ?? "oauth_failed" };
  return {
    ok: true,
    teamId: data.team?.id,
    teamName: data.team?.name,
    botToken: data.access_token,
    botUserId: data.bot_user_id,
    authedUser: data.authed_user?.id,
  };
}
