import { NextResponse, after } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { getInstallation } from "@/lib/slack/installations";
import { resolveSlackActor } from "@/lib/slack/auth";
import { slackUpdateMessage } from "@/lib/slack/client";
import { moveStage, STAGES, OUTCOMES, type Stage, type Outcome } from "@/lib/stage";
import { logAgentRun } from "@/lib/agent/audit";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Slack interactivity endpoint (ADR-010 Phase 4 — the soft-gate transport).
 *
 * Handles the Confirm/Cancel buttons on a move_stage proposal. The button click
 * is the in-thread confirm; on Confirm we execute moveStage (which RE-CHECKS org
 * ownership, so a tampered payload can't move another org's candidate) and edit
 * the message to a result. The clicking user is the audit actor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";

type BlockAction = { action_id?: string; value?: string };
type InteractionPayload = {
  type?: string;
  team?: { id?: string };
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: BlockAction[];
};

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const rawBody = await req.text();
  const signature = req.headers.get("x-slack-signature");
  const timestamp = req.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature({ signingSecret: SIGNING_SECRET, rawBody, signature, timestamp })) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // Interactivity payloads arrive form-encoded: payload=<json>.
  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) return NextResponse.json({ ok: true });
  let payload: InteractionPayload;
  try {
    payload = JSON.parse(payloadRaw) as InteractionPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (payload.type !== "block_actions") return NextResponse.json({ ok: true });
  const action = payload.actions?.[0];
  const teamId = payload.team?.id;
  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const slackUserId = payload.user?.id;
  if (!action?.action_id || !teamId || !channel || !messageTs || !slackUserId) {
    return NextResponse.json({ ok: true });
  }

  // Ack within Slack's 3s window; do the work after the response.
  after(async () => {
    try {
      const installation = await getInstallation(teamId);
      if (!installation) return;
      const actor = await resolveSlackActor(installation, slackUserId);

      if (action.action_id === "stage_cancel") {
        await slackUpdateMessage(installation.botToken, {
          channel,
          ts: messageTs,
          text: "Cancelled — no change made.",
          blocks: [],
        });
        return;
      }

      if (action.action_id === "stage_confirm") {
        let parsed: { candidateIds?: unknown; stage?: unknown; outcome?: unknown } = {};
        try {
          parsed = JSON.parse(action.value ?? "{}");
        } catch {
          /* fall through to the invalid path below */
        }
        const stage = parsed.stage as Stage | undefined;
        const ids = Array.isArray(parsed.candidateIds)
          ? parsed.candidateIds.filter((x): x is string => typeof x === "string")
          : [];
        if (!stage || !(STAGES as readonly string[]).includes(stage) || ids.length === 0) {
          await slackUpdateMessage(installation.botToken, {
            channel,
            ts: messageTs,
            text: "That action expired or was invalid — ask me again.",
            blocks: [],
          });
          return;
        }
        const outcome =
          typeof parsed.outcome === "string" && (OUTCOMES as readonly string[]).includes(parsed.outcome)
            ? (parsed.outcome as Outcome)
            : undefined;

        const results = await Promise.all(ids.map((id) => moveStage(actor.orgId, actor.userId, id, stage, outcome)));
        const moved = results.filter((r) => r.ok).length;

        ids.forEach((id, i) => {
          if (results[i].ok) {
            void logAgentRun({
              orgId: actor.orgId,
              userId: actor.userId,
              surface: "slack",
              kind: "action",
              teamId,
              channel,
              slackUserId,
              detail: { action: "move_stage", candidateId: id, stage },
            });
          }
        });

        const text =
          moved === ids.length
            ? `✅ Moved ${moved === 1 ? "the candidate" : `${moved} candidates`} to *${stage}*.`
            : `Moved ${moved} of ${ids.length} to *${stage}* — the rest couldn't be updated.`;
        await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text, blocks: [] });
      }
    } catch (err) {
      log("error", "slack.interactivity_failed", { requestId, teamId }, err);
    }
  });

  return NextResponse.json({ ok: true });
}
