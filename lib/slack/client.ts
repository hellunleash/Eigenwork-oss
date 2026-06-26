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
): Promise<string | null> {
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(args),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ts?: string };
  if (!data.ok) throw new Error(`slack_postMessage_failed: ${data.error ?? res.status}`);
  return typeof data.ts === "string" ? data.ts : null;
}

export async function slackUpdateMessage(
  botToken: string,
  args: { channel: string; ts: string; text?: string; blocks?: unknown[] }
): Promise<void> {
  const res = await fetch(`${SLACK_API}/chat.update`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(args),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(`slack_update_failed: ${data.error ?? res.status}`);
}

/**
 * Upload a file (resume PDF / CSV export) and share it to a channel — Slack's
 * three-step `files.uploadV2` flow (reserve URL → POST bytes → complete+share).
 * Requires the `files:write` scope. Throws on any step's failure so the caller can
 * fall back to a link / code block (e.g. when the scope hasn't been granted yet).
 */
export async function slackUploadFile(
  botToken: string,
  args: { channel: string; filename: string; bytes: Buffer; title?: string; threadTs?: string }
): Promise<void> {
  // 1. Reserve an external upload URL for this file.
  const getRes = await fetch(`${SLACK_API}/files.getUploadURLExternal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ filename: args.filename, length: String(args.bytes.length) }),
  });
  const getData = (await getRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; upload_url?: string; file_id?: string };
  if (!getData.ok || !getData.upload_url || !getData.file_id) {
    throw new Error(`slack_get_upload_url_failed: ${getData.error ?? getRes.status}`);
  }
  // 2. POST the raw bytes to the reserved URL.
  const putRes = await fetch(getData.upload_url, { method: "POST", body: new Uint8Array(args.bytes) });
  if (!putRes.ok) throw new Error(`slack_file_put_failed: ${putRes.status}`);
  // 3. Complete the upload and share it into the channel/thread.
  const completeRes = await fetch(`${SLACK_API}/files.completeUploadExternal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      files: [{ id: getData.file_id, title: args.title ?? args.filename }],
      channel_id: args.channel,
      ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
    }),
  });
  const completeData = (await completeRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!completeData.ok) throw new Error(`slack_complete_upload_failed: ${completeData.error ?? completeRes.status}`);
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
