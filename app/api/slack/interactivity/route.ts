import { NextResponse, after } from "next/server";
import { verifySlackSignature } from "@/lib/slack/signature";
import { getInstallation } from "@/lib/slack/installations";
import { resolveSlackActor } from "@/lib/slack/auth";
import { slackUpdateMessage } from "@/lib/slack/client";
import { moveStage, STAGES, OUTCOMES, type Stage, type Outcome } from "@/lib/stage";
import { runMatch } from "@/lib/match";
import { asDraft, finalizeIntake } from "@/lib/agent/intake";
import { logAgentRun } from "@/lib/agent/audit";
import { getRequestId, log, type LogContext } from "@/lib/server-logger";

/**
 * Slack interactivity endpoint (ADR-010 Phase 4 + ADR-012 — the write-confirm
 * transport). The button click IS the human confirm for every proposal-only write
 * the agent can make: move_stage (existing), and — for the tool-calling loop —
 * run_match and create_intake. On Confirm we execute the real `lib/` mutation,
 * which RE-CHECKS org ownership server-side from the RESOLVED actor (never the
 * payload), so a tampered/replayed payload can't act on another org. The clicking
 * user is the audit actor. This is the load-bearing T1/T3 boundary: nothing mutates
 * until here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// run_match (ADR-012 confirm) runs the real match inline; bot-plan pools are small,
// but give the same headroom the events route has.
export const maxDuration = 60;

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
      if (!actor) {
        // Fail-closed (guardrail 2): only in-org actors can execute a write.
        log("warn", "slack.actor_denied_interactivity", { requestId, teamId, slackUserId });
        await slackUpdateMessage(installation.botToken, {
          channel,
          ts: messageTs,
          text: "You don't have access to do that in EigenWork.",
          blocks: [],
        });
        return;
      }

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
        return;
      }

      // --- ADR-012 tool-loop write confirms -----------------------------------

      if (action.action_id === "match_cancel" || action.action_id === "intake_cancel") {
        await slackUpdateMessage(installation.botToken, {
          channel,
          ts: messageTs,
          text: action.action_id === "match_cancel" ? "Cancelled — no match run." : "Cancelled — no role created.",
          blocks: [],
        });
        return;
      }

      if (action.action_id === "match_confirm") {
        let parsed: { jobId?: unknown; title?: unknown } = {};
        try {
          parsed = JSON.parse(action.value ?? "{}");
        } catch {
          /* invalid below */
        }
        const jobId = typeof parsed.jobId === "string" ? parsed.jobId : "";
        const title = typeof parsed.title === "string" && parsed.title ? parsed.title : "the role";
        if (!jobId) {
          await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text: "That action expired or was invalid — ask me again.", blocks: [] });
          return;
        }
        await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text: `Running the match for *${title}*… :mag:`, blocks: [] });
        // Ownership re-checked from the RESOLVED actor's org (never the payload) — T3.
        const ctx: LogContext = { requestId, route: "/api/slack/interactivity", userId: actor.userId, jobId };
        const ownsJd = (jd: Record<string, unknown>) => typeof jd.orgId === "string" && jd.orgId === actor.orgId;
        const res = await runMatch(jobId, ctx, ownsJd);
        if (!res.success) {
          await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text: "I couldn't run that match just now — please try again.", blocks: [] });
          return;
        }
        const n = res.top20?.length ?? 0;
        void logAgentRun({
          orgId: actor.orgId,
          userId: actor.userId,
          surface: "slack",
          kind: "action",
          teamId,
          channel,
          slackUserId,
          detail: { action: "run_match", jobId, count: n },
        });
        const text =
          n > 0
            ? `✅ Shortlist rebuilt for *${title}* — *${n}* candidate${n === 1 ? "" : "s"}. Ask me *who are my top candidates for ${title}?*`
            : `I ran the match for *${title}*, but no applicants cleared the bar yet.`;
        await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text, blocks: [] });
        return;
      }

      if (action.action_id === "intake_confirm") {
        let parsed: { draft?: unknown } = {};
        try {
          parsed = JSON.parse(action.value ?? "{}");
        } catch {
          /* invalid below */
        }
        const draft = asDraft((parsed.draft ?? null) as Record<string, unknown> | null);
        if (!draft) {
          await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text: "That draft expired or was invalid — ask me to create the intake link again.", blocks: [] });
          return;
        }
        // finalizeIntake injects org/user from the RESOLVED actor and logs its own
        // create_intake action; createJd re-checks the active-role limit (T1/T3).
        const out = await finalizeIntake(actor.orgId, actor.userId, draft, { teamId, channel, slackUserId });
        await slackUpdateMessage(installation.botToken, { channel, ts: messageTs, text: out, blocks: [] });
        return;
      }
    } catch (err) {
      log("error", "slack.interactivity_failed", { requestId, teamId }, err);
    }
  });

  return NextResponse.json({ ok: true });
}
