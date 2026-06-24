import {
  listJobs,
  getOrgCandidateRoster,
  getCandidateDetail,
  type CandidateDetail,
  type CandidateLite,
} from "@/lib/agent/data";
import { routeMessage, type RouterResult, type IntakeFields } from "@/lib/agent/router";
import { synthDescribe, synthCompare, synthExplain, candidateFacts } from "@/lib/agent/synthesis";
import { judgeAnswer } from "@/lib/agent/judge";
import { scrubJargon } from "@/lib/agent/jargon";
import { createJd } from "@/lib/jd";
import { STAGES } from "@/lib/stage";
import { composeOutreach, buildMailto } from "@/lib/outreach";
import { logAgentRun } from "@/lib/agent/audit";

/**
 * The agent turn (ADR-010 Phase 2 + 3). Free-text in → router → execute → (for
 * synthesis) judge + jargon-scrub → reply text. Read tools are deterministic
 * where possible (find/list never hit an LLM, so they can't hallucinate); only
 * the synthesis intents (describe/compare/explain) call the model, and every one
 * is grounded + judged. create_intake (Phase 3) reuses lib/jd.ts createJd.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export type AgentTurnParams = {
  orgId: string;
  userId: string;
  text: string;
  teamId?: string;
  channel?: string;
  slackUserId?: string;
};

/** A reply may be plain text or carry Slack Block Kit (e.g. the move_stage
 *  confirm buttons). The events route posts both. */
export type AgentReply = { text: string; blocks?: unknown[] };

export async function runAgentTurn(params: AgentTurnParams): Promise<AgentReply> {
  const { orgId, userId, text } = params;
  const [jobs, roster] = await Promise.all([listJobs(orgId), getOrgCandidateRoster(orgId)]);
  const route = await routeMessage(text, jobs, roster);

  await logAgentRun({
    orgId,
    userId,
    surface: "slack",
    kind: "tool_call",
    teamId: params.teamId,
    channel: params.channel,
    slackUserId: params.slackUserId,
    detail: { intent: route.intent, candidateIds: route.candidateIds ?? [], jobId: route.jobId ?? null },
  });

  switch (route.intent) {
    case "help":
      return { text: helpText() };
    case "clarify":
      return { text: route.clarifyQuestion || "Which candidate do you mean? Tell me the name as it appears in your pipeline." };
    case "find":
      return { text: findCandidates(route, roster) };
    case "create_intake":
      return { text: await createIntake(orgId, userId, route.intake ?? {}, params) };
    case "describe":
    case "explain":
    case "compare":
      return { text: await synthesizeAnswer(orgId, route, text) };
    case "move_stage":
      return buildStageConfirm(route, roster);
    case "draft_outreach":
      return buildOutreachDrafts(orgId, route, params);
    default:
      return { text: helpText() };
  }
}

/**
 * move_stage (soft gate): post an in-thread confirm with Confirm/Cancel buttons.
 * The actual stage write happens in /api/slack/interactivity when Confirm is
 * clicked — guarding against a misparsed name. The button `value` carries the
 * resolved ids + stage; moveStage re-checks org ownership on execute.
 */
function buildStageConfirm(route: RouterResult, roster: CandidateLite[]): AgentReply {
  const ids = route.candidateIds ?? [];
  if (ids.length === 0) {
    return { text: "I couldn't match that to a candidate in your shortlists — try the exact name as it appears in your pipeline." };
  }
  const stage = route.targetStage;
  if (!stage || !(STAGES as readonly string[]).includes(stage)) {
    return { text: "Which stage should I move them to — interviewing, offer, hired, rejected, or withdrawn?" };
  }
  const names = ids.map((id) => roster.find((c) => c.id === id)?.name ?? "the candidate");
  const label = names.length === 1 ? `*${names[0]}*` : `*${names.length} candidates* (${names.join(", ")})`;
  const prompt = `Move ${label} to *${stage}*?`;
  const value = JSON.stringify({ candidateIds: ids, stage, outcome: route.outcome ?? null });
  return {
    text: prompt,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: prompt } },
      {
        type: "actions",
        elements: [
          { type: "button", style: "primary", text: { type: "plain_text", text: "Confirm" }, action_id: "stage_confirm", value },
          { type: "button", text: { type: "plain_text", text: "Cancel" }, action_id: "stage_cancel", value: "{}" },
        ],
      },
    ],
  };
}

/**
 * draft_outreach (hard gate): compose a personalized email per candidate from the
 * persisted card and post it with a `mailto:` link. The recruiter sends from their
 * OWN client — the bot never sends. Capped at 5 to keep the message readable.
 */
async function buildOutreachDrafts(orgId: string, route: RouterResult, params: AgentTurnParams): Promise<AgentReply> {
  const ids = (route.candidateIds ?? []).slice(0, 5);
  if (ids.length === 0) {
    return { text: "Who should I draft outreach to? Tell me the candidate's name." };
  }
  const details = (await Promise.all(ids.map((id) => getCandidateDetail(orgId, id)))).filter(
    (d): d is CandidateDetail => d !== null
  );
  if (details.length === 0) return { text: "I couldn't load that candidate's details." };

  const parts = details.map((d) => {
    const draft = composeOutreach({
      candidateName: d.name,
      roleTitle: d.jobTitle,
      cardTitle: d.card?.title ?? null,
      cardEdge: d.card?.edge ?? null,
    });
    if (!d.email) return `*${d.name}* — no email on file, can't draft outreach.`;
    const mailto = buildMailto(d.email, draft);
    return `*${d.name}* — _${draft.subject}_\n${draft.body}\n<${mailto}|📧 Open in your email to send>`;
  });

  await logAgentRun({
    orgId,
    userId: params.userId,
    surface: "slack",
    kind: "action",
    teamId: params.teamId,
    channel: params.channel,
    slackUserId: params.slackUserId,
    detail: { action: "draft_outreach", candidateIds: ids },
  });

  return { text: parts.join("\n\n———\n\n") };
}

async function synthesizeAnswer(orgId: string, route: RouterResult, question: string): Promise<string> {
  const ids = route.candidateIds ?? [];
  if (ids.length === 0) {
    return "I couldn't match that to a candidate in your shortlists. Try the exact name as it appears in your pipeline.";
  }
  const details = (await Promise.all(ids.map((id) => getCandidateDetail(orgId, id)))).filter(
    (d): d is CandidateDetail => d !== null
  );
  if (details.length === 0) return "I couldn't load that candidate's details.";

  let answer: string;
  let grounding: string;
  if (route.intent === "compare" && details.length >= 2) {
    answer = await synthCompare(details);
    grounding = details.map((d) => candidateFacts(d)).join("\n\n");
  } else if (route.intent === "explain") {
    answer = await synthExplain(details[0], route.topic || question);
    grounding = candidateFacts(details[0]);
  } else {
    answer = await synthDescribe(details[0]);
    grounding = candidateFacts(details[0]);
  }

  const verdict = await judgeAnswer(question, answer, grounding);
  if (!verdict.ok) {
    // Jargon leak → final scrub. Any other grounding failure → safe fallback
    // rather than risk an unsupported claim.
    if (verdict.reason?.toLowerCase().includes("jargon")) return scrubJargon(answer);
    return "I don't have confident, grounded data to answer that precisely. Try asking about a specific candidate's strengths or the concern to probe.";
  }
  return answer;
}

function findCandidates(route: RouterResult, roster: CandidateLite[]): string {
  let pool = roster;
  if (route.jobId) pool = roster.filter((c) => c.jobId === route.jobId);
  if (pool.length === 0) {
    return route.jobId
      ? "That role doesn't have a shortlist yet — run a match on the dashboard first."
      : "You don't have any shortlisted candidates yet. Once candidates apply and are screened, I can rank them here.";
  }
  const top = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
  const header = route.jobId && top[0] ? `Top candidates for *${top[0].jobTitle || "this role"}*:` : "Your strongest candidates:";
  const lines = top.map((c, i) => `${i + 1}. *${c.name}* — score ${c.score ?? "—"}${c.jobTitle && !route.jobId ? ` (${c.jobTitle})` : ""}`);
  return [header, ...lines, "", "_Ask “tell me about <name>” or “why is <A> stronger than <B>?” for the detail._"].join("\n");
}

async function createIntake(
  orgId: string,
  userId: string,
  intake: IntakeFields,
  params: AgentTurnParams
): Promise<string> {
  const result = await createJd(orgId, userId, {
    title: intake.title ?? "",
    seniority: intake.seniority ?? "",
    location_type: intake.location_type ?? "",
    employment_type: intake.employment_type ?? "",
    yoe_required: intake.yoe_required ?? "",
  });
  if (!result.ok) {
    if (result.error === "role_limit_reached") {
      return `You've reached your plan's active-role limit (${result.activeRoles}/${result.roleLimit}). Close a role or upgrade to open another intake link.`;
    }
    return "I couldn't create that role just now — please try again.";
  }

  await logAgentRun({
    orgId,
    userId,
    surface: "slack",
    kind: "action",
    teamId: params.teamId,
    channel: params.channel,
    slackUserId: params.slackUserId,
    detail: { action: "create_intake", jobId: result.jobId, title: intake.title ?? "" },
  });

  const link = `${APP_URL}/candidate?jobId=${result.jobId}`;
  const title = intake.title || "your new role";
  return [
    `Here's the intake link for *${title}* — candidates apply and get auto-screened, no extra setup:`,
    link,
    "",
    "Paste-ready for your network:",
    `> We're hiring${intake.title ? ` a ${intake.title}` : ""}! Apply here and you'll hear back fast 👇`,
    `> ${link}`,
  ].join("\n");
}

function helpText(): string {
  return [
    "👋 I'm EigenBot. I answer straight from your screened candidates — no dashboard needed. Try:",
    "• *Tell me about <candidate>*",
    "• *Why is <A> stronger than <B>?*",
    "• *Who are my top candidates for <role>?*",
    "• *Move <candidate> to interview* / *reject <candidate>*",
    "• *Draft outreach to <candidate>*",
    "• *Create an intake link for a senior backend role*",
  ].join("\n");
}
