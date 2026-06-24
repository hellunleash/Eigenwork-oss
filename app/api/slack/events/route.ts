import { NextResponse, after } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { getInstallation } from "@/lib/slack/installations";
import { resolveSlackActor } from "@/lib/slack/auth";
import { consumeChatBudget } from "@/lib/agent/budget";
import { logAgentRun } from "@/lib/agent/audit";
import { runAgentTurn, type AgentReply } from "@/lib/agent/loop";
import { slackPostMessage, slackUpdateMessage } from "@/lib/slack/client";
import { claimSlackEvent } from "@/lib/slack/dedupe";
import { toSlackMrkdwn } from "@/lib/agent/mrkdwn";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Slack Events API endpoint (ADR-010 Phase 1 — the guardrail spine).
 *
 * Flow per inbound event:
 *   1. verify signature (guardrail 1) on the RAW body
 *   2. answer the one-time url_verification challenge
 *   3. ack Slack within 3s, then process in after()
 *   4. resolve actor (guardrail 2), consume daily budget (guardrail 3), audit-log
 *   5. Phase 1 replies with a placeholder — Phase 2 swaps in the agent loop.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const rawBody = await req.text();
  const signature = req.headers.get("x-slack-signature");
  const timestamp = req.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature({ signingSecret: SIGNING_SECRET, rawBody, signature, timestamp })) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // One-time URL verification handshake when configuring the event URL.
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Ack (and don't reprocess) Slack's delivery retries.
  if (req.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event as Record<string, unknown> | undefined;
  const teamId = typeof payload.team_id === "string" ? payload.team_id : null;
  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;

  // Only app_mentions + direct messages; never the bot's own / other bots' messages.
  const isRelevant =
    !!event &&
    (event.type === "app_mention" ||
      (event.type === "message" && event.channel_type === "im")) &&
    !event.bot_id &&
    typeof event.user === "string" &&
    typeof event.channel === "string";

  if (isRelevant && teamId) {
    const ev = event as Record<string, unknown>;
    const slackUserId = ev.user as string;
    const channel = ev.channel as string;
    const threadTs = typeof ev.ts === "string" ? ev.ts : undefined;
    const text = typeof ev.text === "string" ? ev.text : "";
    // Conversation memory key: the thread root if this is a threaded reply, else the
    // channel (a DM is one rolling conversation). Lets follow-ups resolve "both"/"them".
    const convoRoot = typeof ev.thread_ts === "string" ? ev.thread_ts : channel;
    const convoKey = `${teamId}:${convoRoot}`;

    // Ack now; process after the response (Slack's 3s window).
    after(async () => {
      try {
        // Idempotency: Slack is at-least-once; drop a duplicate delivery before any work.
        if (!(await claimSlackEvent(eventId))) {
          log("info", "slack.duplicate_event", { requestId, teamId, eventId });
          return;
        }
        const installation = await getInstallation(teamId);
        if (!installation) {
          log("warn", "slack.no_installation", { requestId, teamId });
          return;
        }

        const actor = await resolveSlackActor(installation, slackUserId);
        if (!actor) {
          // Fail-closed (guardrail 2): an unknown / non-member workspace user gets
          // no access to org data. No budget spent, no LLM call.
          log("warn", "slack.actor_denied", { requestId, teamId, slackUserId });
          await slackPostMessage(installation.botToken, {
            channel,
            thread_ts: threadTs,
            text: "I can only help EigenWork members of this workspace. Ask whoever set up EigenWork to add your account — your Slack email needs to match your EigenWork login.",
          });
          return;
        }
        const budget = await consumeChatBudget(actor.orgId);
        await logAgentRun({
          orgId: actor.orgId,
          userId: actor.userId,
          surface: "slack",
          kind: "message",
          teamId,
          channel,
          slackUserId,
          text,
          detail: { allowed: budget.allowed, count: budget.count, mappedFromEmail: actor.mappedFromEmail },
        });

        if (!budget.allowed) {
          await slackPostMessage(installation.botToken, {
            channel,
            thread_ts: threadTs,
            text: `You've reached today's EigenBot limit (${budget.cap} questions). It resets at midnight UTC.`,
          });
          return;
        }

        // Post an immediate placeholder so the recruiter sees activity during the
        // multi-call turn, then edit it in place with the answer (better than a
        // multi-second silence). Strip the bot @mention from app_mention text.
        const cleanedText = text.replace(/<@[A-Z0-9]+>/g, "").trim();
        const placeholderTs = await slackPostMessage(installation.botToken, {
          channel,
          thread_ts: threadTs,
          text: "On it… :mag:",
        });

        let reply: AgentReply;
        try {
          reply = await runAgentTurn({
            orgId: actor.orgId,
            userId: actor.userId,
            text: cleanedText,
            teamId,
            channel,
            slackUserId,
            convoKey,
          });
        } catch (err) {
          log("error", "slack.turn_failed", { requestId, teamId }, err);
          reply = { text: "Something went wrong on my end — give that another try in a moment." };
        }

        // Normalize the model's Markdown into Slack mrkdwn before posting.
        const outText = toSlackMrkdwn(reply.text);
        const blocks = reply.blocks ?? [];
        if (placeholderTs) {
          await slackUpdateMessage(installation.botToken, { channel, ts: placeholderTs, text: outText, blocks });
        } else {
          await slackPostMessage(installation.botToken, {
            channel,
            thread_ts: threadTs,
            text: outText,
            ...(reply.blocks && { blocks: reply.blocks }),
          });
        }
      } catch (err) {
        log("error", "slack.process_failed", { requestId, teamId }, err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
