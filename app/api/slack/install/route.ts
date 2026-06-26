import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { signState } from "@/lib/slack/state";

/**
 * Start the "Add to Slack" flow (ADR-010 Phase 1). Called via an AUTHENTICATED
 * fetch from the dashboard (Bearer Firebase token), it returns the Slack OAuth
 * authorize URL with a signed `state` carrying the caller's uid + org. The client
 * then navigates the browser there. (A plain link can't be used — it wouldn't
 * carry the auth token needed to know which org is installing.)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID = process.env.SLACK_CLIENT_ID ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const SCOPES = [
  "app_mentions:read",
  "chat:write",
  "files:write", // attach resume PDFs + CSV exports to the chat (ADR-012)
  "im:history",
  "im:read",
  "im:write",
  "users:read",
  "users:read.email",
].join(",");

export async function GET(req: Request) {
  const ctx = await requireOrgMember(req.headers);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (!CLIENT_ID || !APP_URL) {
    return NextResponse.json({ error: "slack_not_configured" }, { status: 503 });
  }

  const state = signState({ uid: ctx.userId, orgId: ctx.orgId });
  const redirectUri = `${APP_URL}/api/slack/oauth`;
  const authorizeUrl =
    `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.json({ url: authorizeUrl });
}
