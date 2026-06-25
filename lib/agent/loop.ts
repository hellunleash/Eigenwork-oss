import {
  listJobs,
  getOrgCandidateRoster,
  getCandidateDetail,
  type CandidateDetail,
  type CandidateLite,
  type JobLite,
} from "@/lib/agent/data";
import { routeMessage, type RouterResult, type IntakeFields } from "@/lib/agent/router";
import { synthDescribe, synthCompare, synthExplain, candidateFacts } from "@/lib/agent/synthesis";
import { judgeAnswer } from "@/lib/agent/judge";
import { scrubJargon } from "@/lib/agent/jargon";
import { createJd } from "@/lib/jd";
import { parseJdText } from "@/lib/jd-parse";
import { buildOneLiner, cleanTitle } from "@/lib/jd-role-fit";
import {
  WORK_AUTH_OPTIONS,
  LOCATION_TYPES,
  EMPLOYMENT_TYPES,
  workAuthChoiceToBooleans,
  type WorkAuthChoice,
} from "@/lib/jd-options";
import { STAGES } from "@/lib/stage";
import { composeOutreach, buildMailto } from "@/lib/outreach";
import { logAgentRun } from "@/lib/agent/audit";
import {
  loadConvo,
  saveTurn,
  loadPendingIntake,
  savePendingIntake,
  clearPendingIntake,
} from "@/lib/agent/memory";

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
  /** Conversation key (DM channel or thread root). When set, the turn loads +
   *  persists short rolling memory so follow-ups ("both", "the first one") resolve. */
  convoKey?: string;
};

/** A reply may be plain text or carry Slack Block Kit (e.g. the move_stage
 *  confirm buttons). The events route posts both. */
export type AgentReply = { text: string; blocks?: unknown[] };

export async function runAgentTurn(params: AgentTurnParams): Promise<AgentReply> {
  const { orgId, userId, text } = params;
  const [jobs, roster] = await Promise.all([listJobs(orgId), getOrgCandidateRoster(orgId)]);
  const history = params.convoKey ? await loadConvo(params.convoKey) : [];
  const pendingIntake = params.convoKey ? await loadPendingIntake(params.convoKey) : null;

  // Confirm-and-fill fast path: when a draft is waiting on ONE specific field
  // (work_auth → location → employment), interpret a numbered/labelled reply
  // deterministically — no LLM, no misclassification. Anything we can't read as
  // a pick for that field (a free-text edit, "create it", a new request) falls
  // through to the router below.
  if (params.convoKey && pendingIntake) {
    const awaiting = pendingIntake._awaiting;
    const base = asDraft(pendingIntake);
    if (typeof awaiting === "string" && (GAP_ORDER as readonly string[]).includes(awaiting) && base) {
      const updated = applyGapAnswer(base, awaiting as Gap, text);
      if (updated) {
        await logAgentRun({
          orgId,
          userId,
          surface: "slack",
          kind: "tool_call",
          teamId: params.teamId,
          channel: params.channel,
          slackUserId: params.slackUserId,
          detail: { intent: "edit_intake", gap: awaiting },
        });
        const replyText = await respondWithGapOrConfirm(updated, params);
        const summary = replyText.length > 300 ? `${replyText.slice(0, 300)}…` : replyText;
        await saveTurn(params.convoKey, { role: "user", text }, { role: "bot", text: summary });
        return { text: replyText };
      }
    }
  }

  const route = await routeMessage(text, jobs, roster, history, pendingIntake);

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

  const reply = await executeRoute(orgId, userId, route, roster, jobs, text, params);

  // Persist the turn so the NEXT message can resolve follow-ups against it.
  if (params.convoKey) {
    const ids = referencedIds(route, roster);
    const summary = reply.text.length > 300 ? `${reply.text.slice(0, 300)}…` : reply.text;
    await saveTurn(
      params.convoKey,
      { role: "user", text },
      { role: "bot", text: summary, ...(ids.length ? { ids } : {}) }
    );
  }
  return reply;
}

async function executeRoute(
  orgId: string,
  userId: string,
  route: RouterResult,
  roster: CandidateLite[],
  jobs: JobLite[],
  text: string,
  params: AgentTurnParams
): Promise<AgentReply> {
  switch (route.intent) {
    case "help":
      return { text: helpText() };
    case "clarify":
      return { text: route.clarifyQuestion || "Which candidate do you mean? Tell me the name as it appears in your pipeline." };
    case "list_roles":
      return { text: listRoles(jobs) };
    case "find":
      return { text: findCandidates(route, roster) };
    case "create_intake":
      return { text: await proposeIntake(orgId, userId, route.intake ?? {}, params) };
    case "edit_intake":
      return { text: await editIntake(route, params) };
    case "confirm_intake":
      return { text: await confirmIntake(orgId, userId, params) };
    case "cancel_intake":
      if (params.convoKey) await clearPendingIntake(params.convoKey);
      return { text: "Okay — I won't create that link. Say *create an intake link for <role>* whenever you're ready." };
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

/** The candidate ids in play after a turn — what the next message's "both"/"them"/
 *  "the first one" should resolve against. For `find` it's the listed shortlist. */
function referencedIds(route: RouterResult, roster: CandidateLite[]): string[] {
  if (route.intent === "find") return rankedPool(route, roster).map((c) => c.id);
  return route.candidateIds ?? [];
}

/** Shared shortlist ranking used by `find` output and `referencedIds`. */
function rankedPool(route: RouterResult, roster: CandidateLite[]): CandidateLite[] {
  const pool = route.jobId ? roster.filter((c) => c.jobId === route.jobId) : roster;
  return [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
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
    // Jargon leak → final scrub. Any other grounding failure → degrade to a
    // deterministic, grounded-by-construction card summary rather than a dead-end
    // (the judge is occasionally over-strict on borderline phrasings; the persisted
    // card is the recruiter-facing source of truth and can't hallucinate).
    if (verdict.reason?.toLowerCase().includes("jargon")) return scrubJargon(answer);
    return cardSummary(details);
  }
  return answer;
}

/** Deterministic fallback: each candidate's persisted headline + edge + score.
 *  Grounded by construction (the card already passed ADR-007 validation). */
function cardSummary(details: CandidateDetail[]): string {
  const blocks = details.map((d) => {
    const lines = [`*${d.name}*${d.score != null ? ` — score ${d.score}` : ""}`];
    if (d.card?.title) lines.push(d.card.title);
    if (d.card?.edge) lines.push(d.card.edge);
    return lines.join("\n");
  });
  const intro = details.length > 1 ? "Here's where each stands:" : "Here's the summary:";
  return [intro, ...blocks].join("\n\n");
}

function findCandidates(route: RouterResult, roster: CandidateLite[]): string {
  const top = rankedPool(route, roster);
  if (top.length === 0) {
    return route.jobId
      ? "That role doesn't have a shortlist yet — run a match on the dashboard first."
      : "You don't have any shortlisted candidates yet. Once candidates apply and are screened, I can rank them here.";
  }
  const header = route.jobId && top[0] ? `Top candidates for *${top[0].jobTitle || "this role"}*:` : "Your strongest candidates:";
  const lines = top.map((c, i) => `${i + 1}. *${c.name}* — score ${c.score ?? "—"}${c.jobTitle && !route.jobId ? ` (${c.jobTitle})` : ""}`);
  return [header, ...lines, "", "_Ask “tell me about <name>” or “why is <A> stronger than <B>?” for the detail._"].join("\n");
}

/**
 * create_intake is a confirm-and-fill flow (it WRITES a JD + consumes a role slot,
 * so it's gated like move_stage). proposeIntake parses the request into a complete
 * draft and parks it; the recruiter fills gaps (esp. work-auth, which the parser
 * never produces) by replying, then confirms. Nothing is minted until confirm.
 */
type IntakeDraft = {
  title: string;
  seniority: string;
  role_category: string;
  tech_stack: string[];
  location_type: string;
  employment_type: string;
  yoe_required: string;
  work_auth_us_required: boolean;
  work_auth_eu_required: boolean;
  work_auth_provided: boolean;
  /** True once work-auth has been settled — either the recruiter stated a
   *  requirement up front, or they picked an option (incl. "none") when asked.
   *  Distinguishes a deliberate "none" (all booleans false) from "not asked yet". */
  work_auth_answered: boolean;
  primary: string[];
  secondary: string[];
  tertiary: string[];
};

/** Parse the recruiter's request into a full draft (same parse the web flow uses),
 *  overlaying any fields the router extracted explicitly. */
async function buildIntakeDraft(intake: IntakeFields, params: AgentTurnParams): Promise<IntakeDraft> {
  let parsed: Awaited<ReturnType<typeof parseJdText>> | null = null;
  try {
    parsed = await parseJdText(params.text);
  } catch {
    parsed = null;
  }
  // The JD parser never produces work-auth, so it's "answered" up front only if
  // the recruiter's own message stated one (the router sets any work_auth_* key).
  const workAuthStated =
    intake.work_auth_us_required !== undefined ||
    intake.work_auth_eu_required !== undefined ||
    intake.work_auth_provided !== undefined;
  return {
    title: intake.title || parsed?.title || "New role",
    seniority: intake.seniority ?? parsed?.seniority ?? "",
    role_category: parsed?.role_category ?? "",
    tech_stack: parsed?.tech_stack ?? [],
    location_type: intake.location_type ?? parsed?.location_type ?? "",
    employment_type: intake.employment_type ?? parsed?.employment_type ?? "",
    yoe_required: intake.yoe_required ?? parsed?.yoe_required ?? "",
    work_auth_us_required: Boolean(intake.work_auth_us_required),
    work_auth_eu_required: Boolean(intake.work_auth_eu_required),
    work_auth_provided: Boolean(intake.work_auth_provided),
    work_auth_answered: workAuthStated,
    primary: parsed?.primary ?? [],
    secondary: parsed?.secondary ?? [],
    tertiary: parsed?.tertiary ?? [],
  };
}

function asDraft(p: Record<string, unknown> | null): IntakeDraft | null {
  if (!p) return null;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const a = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]) : []);
  return {
    title: s("title") || "New role",
    seniority: s("seniority"),
    role_category: s("role_category"),
    tech_stack: a("tech_stack"),
    location_type: s("location_type"),
    employment_type: s("employment_type"),
    yoe_required: s("yoe_required"),
    work_auth_us_required: Boolean(p.work_auth_us_required),
    work_auth_eu_required: Boolean(p.work_auth_eu_required),
    work_auth_provided: Boolean(p.work_auth_provided),
    work_auth_answered: Boolean(p.work_auth_answered),
    primary: a("primary"),
    secondary: a("secondary"),
    tertiary: a("tertiary"),
  };
}

/** Merge the router's edit (only the fields it returned) onto the draft. */
function mergeEdit(d: IntakeDraft, intake: IntakeFields): IntakeDraft {
  const workAuthTouched =
    intake.work_auth_us_required !== undefined ||
    intake.work_auth_eu_required !== undefined ||
    intake.work_auth_provided !== undefined;
  return {
    ...d,
    ...(intake.title ? { title: intake.title } : {}),
    ...(intake.seniority ? { seniority: intake.seniority } : {}),
    ...(intake.location_type ? { location_type: intake.location_type } : {}),
    ...(intake.employment_type ? { employment_type: intake.employment_type } : {}),
    ...(intake.yoe_required ? { yoe_required: intake.yoe_required } : {}),
    ...(intake.work_auth_us_required !== undefined ? { work_auth_us_required: Boolean(intake.work_auth_us_required) } : {}),
    ...(intake.work_auth_eu_required !== undefined ? { work_auth_eu_required: Boolean(intake.work_auth_eu_required) } : {}),
    ...(intake.work_auth_provided !== undefined ? { work_auth_provided: Boolean(intake.work_auth_provided) } : {}),
    ...(workAuthTouched ? { work_auth_answered: true } : {}),
  };
}

/**
 * The three fields the recruiter PICKS (not free text), in the order we ask for
 * any the JD didn't already provide. Work-auth is never in a JD's parsed output,
 * so it's asked unless the recruiter stated it; location/employment are asked
 * only when the parser left them blank. Everything else stays autofilled.
 */
const GAP_ORDER = ["work_auth", "location_type", "employment_type"] as const;
type Gap = (typeof GAP_ORDER)[number];

/** First field still needing a pick, in GAP_ORDER, or null when the draft is complete. */
function firstGap(d: IntakeDraft): Gap | null {
  if (!d.work_auth_answered && !(d.work_auth_us_required || d.work_auth_eu_required || d.work_auth_provided)) {
    return "work_auth";
  }
  if (!d.location_type.trim()) return "location_type";
  if (!d.employment_type.trim()) return "employment_type";
  return null;
}

/** The numbered question for a gap — options come straight from lib/jd-options
 *  (same choices the web confirm page shows), so the recruiter just replies a number. */
function askGap(g: Gap): string {
  if (g === "work_auth") {
    return [
      "🛂 What *work authorization* does this role require? Reply with the number:",
      ...WORK_AUTH_OPTIONS.map((o, i) => `${i + 1}. ${o.title}`),
    ].join("\n");
  }
  if (g === "location_type") {
    return [
      "📍 What's the *work location*? Reply with the number:",
      ...LOCATION_TYPES.map((o, i) => `${i + 1}. ${o}`),
    ].join("\n");
  }
  return [
    "💼 What's the *employment type*? Reply with the number:",
    ...EMPLOYMENT_TYPES.map((o, i) => `${i + 1}. ${o}`),
  ].join("\n");
}

/** Interpret a reply to a gap question as a pick (a number, or the option label).
 *  Returns the updated draft, or null if it isn't a recognizable answer for that
 *  field (so the caller falls back to the LLM router for edits/confirm/cancel). */
function applyGapAnswer(d: IntakeDraft, gap: Gap, text: string): IntakeDraft | null {
  const t = text.trim().toLowerCase();
  const numMatch = t.match(/^#?\s*(\d+)/);
  const n = numMatch ? parseInt(numMatch[1], 10) : NaN;

  if (gap === "work_auth") {
    let choice: WorkAuthChoice | null = null;
    if (n >= 1 && n <= WORK_AUTH_OPTIONS.length) choice = WORK_AUTH_OPTIONS[n - 1].value;
    else if (/sponsor|visa/.test(t)) choice = "sponsor";
    else if (/\bus\b|u\.s\.|united states|america/.test(t)) choice = "us";
    else if (/\beu\b|europe/.test(t)) choice = "eu";
    else if (/\b(none|no|not required|open|anyone|any|n\/a)\b/.test(t)) choice = "none";
    if (!choice) return null;
    return { ...d, ...workAuthChoiceToBooleans(choice), work_auth_answered: true };
  }

  if (gap === "location_type") {
    let v: string | null = null;
    if (n >= 1 && n <= LOCATION_TYPES.length) v = LOCATION_TYPES[n - 1];
    else if (/remote/.test(t)) v = "Remote";
    else if (/hybrid/.test(t)) v = "Hybrid";
    else if (/on.?site|onsite|in.?office/.test(t)) v = "On-site";
    if (!v) return null;
    return { ...d, location_type: v };
  }

  // employment_type
  let v: string | null = null;
  if (n >= 1 && n <= EMPLOYMENT_TYPES.length) v = EMPLOYMENT_TYPES[n - 1];
  else if (/full.?time|\bft\b/.test(t)) v = "Full-time";
  else if (/intern/.test(t)) v = "Intern";
  else if (/contract/.test(t)) v = "Contract";
  if (!v) return null;
  return { ...d, employment_type: v };
}

/** The running draft summary — what the JD autofilled, with unfilled picks
 *  flagged. No trailing instruction; the caller appends the next gap question
 *  or the confirm footer. */
function draftSummary(d: IntakeDraft): string {
  const skills = [...d.primary, ...d.secondary, ...d.tertiary];
  const set = (v: string) => (v && v.trim() ? v : "_not set_");
  let auth: string;
  if (!d.work_auth_answered && !(d.work_auth_us_required || d.work_auth_eu_required || d.work_auth_provided)) {
    auth = "_to be set_";
  } else {
    const bits: string[] = [];
    if (d.work_auth_us_required) bits.push("US required");
    if (d.work_auth_eu_required) bits.push("EU required");
    if (d.work_auth_provided) bits.push("sponsorship provided");
    auth = bits.length ? bits.join(", ") : "none required";
  }
  return [
    `📋 Draft intake link — *${d.title}*`,
    `• Seniority: ${set(d.seniority)}`,
    `• Location: ${set(d.location_type)}`,
    `• Type: ${set(d.employment_type)}`,
    `• Experience: ${set(d.yoe_required)}`,
    `• Work auth: ${auth}`,
    `• Skills: ${skills.length ? skills.join(", ") : "_none detected_"}`,
  ].join("\n");
}

const CONFIRM_FOOTER =
  "Reply to change anything (e.g. *“senior”*, *“5+ years”*), or say *create it* to mint the link.";

/** Persist the draft and respond: ask the next missing pick, or — when nothing's
 *  missing — show the final summary and invite confirmation. `_awaiting` carries
 *  which field a bare-number reply should fill ("" once complete; the map is
 *  deep-merged on save, so it's overwritten, never left stale). */
async function respondWithGapOrConfirm(draft: IntakeDraft, params: AgentTurnParams): Promise<string> {
  const gap = firstGap(draft);
  const record: Record<string, unknown> = { ...(draft as unknown as Record<string, unknown>), _awaiting: gap ?? "" };
  if (params.convoKey) await savePendingIntake(params.convoKey, record);
  const tail = gap ? askGap(gap) : CONFIRM_FOOTER;
  return [draftSummary(draft), "", tail].join("\n");
}

async function proposeIntake(
  orgId: string,
  userId: string,
  intake: IntakeFields,
  params: AgentTurnParams
): Promise<string> {
  const draft = await buildIntakeDraft(intake, params);
  if (!params.convoKey) {
    // No conversation to hold a draft (e.g. a non-Slack caller) — mint directly.
    return finalizeIntake(orgId, userId, draft, params);
  }
  return respondWithGapOrConfirm(draft, params);
}

async function editIntake(route: RouterResult, params: AgentTurnParams): Promise<string> {
  if (!params.convoKey) return "I lost track of that draft — say *create an intake link for <role>* to start over.";
  const draft = asDraft(await loadPendingIntake(params.convoKey));
  if (!draft) return "I don't have a draft link in progress. Say *create an intake link for <role>* to start one.";
  const merged = mergeEdit(draft, route.intake ?? {});
  return respondWithGapOrConfirm(merged, params);
}

async function confirmIntake(orgId: string, userId: string, params: AgentTurnParams): Promise<string> {
  if (!params.convoKey) return "I lost track of that draft — say *create an intake link for <role>* to start over.";
  const draft = asDraft(await loadPendingIntake(params.convoKey));
  if (!draft) return "Nothing to confirm — say *create an intake link for <role>* to start one.";
  const out = await finalizeIntake(orgId, userId, draft, params);
  await clearPendingIntake(params.convoKey);
  return out;
}

/** Mint the JD from a confirmed draft — the same complete payload a web JD gets. */
async function finalizeIntake(
  orgId: string,
  userId: string,
  d: IntakeDraft,
  params: AgentTurnParams
): Promise<string> {
  const result = await createJd(orgId, userId, {
    title: d.title,
    seniority: d.seniority,
    role_category: d.role_category,
    tech_stack: d.tech_stack,
    location_type: d.location_type,
    employment_type: d.employment_type,
    yoe_required: d.yoe_required,
    work_auth_us_required: d.work_auth_us_required,
    work_auth_eu_required: d.work_auth_eu_required,
    work_auth_provided: d.work_auth_provided,
    role_fit: {
      title: cleanTitle(d.title),
      primary: d.primary,
      secondary: d.secondary,
      tertiary: d.tertiary,
      one_liner: buildOneLiner(d.title, d.primary, d.secondary, d.tertiary),
    },
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
    detail: { action: "create_intake", jobId: result.jobId, title: d.title },
  });

  const link = `${APP_URL}/candidate?jobId=${result.jobId}`;
  return [
    `✅ Done — intake link for *${d.title}*:`,
    link,
    "",
    "Paste-ready for your network:",
    `> We're hiring a ${d.title}! Apply here and you'll hear back fast 👇`,
    `> ${link}`,
  ].join("\n");
}

function listRoles(jobs: JobLite[]): string {
  if (jobs.length === 0) {
    return "You don't have any roles open yet. Say *create an intake link for <role>* and I'll mint one you can share.";
  }
  const lines = jobs.map(
    (j, i) => `${i + 1}. *${j.title || "Untitled role"}*${j.seniority ? ` — ${j.seniority}` : ""}`
  );
  return [`You have *${jobs.length}* role${jobs.length === 1 ? "" : "s"} in your pipeline:`, ...lines].join("\n");
}

function helpText(): string {
  return [
    "👋 I'm EigenBot — run your whole hiring loop right here, no dashboard needed. Try:",
    "📨  *Create an intake link for a senior backend role* — share it anywhere to collect applicants",
    "📋  *How many roles do I have?*  ·  *List my roles*",
    "🔎  *Who are my top candidates for <role>?*",
    "👤  *Tell me about <candidate>*  ·  *Why is <A> stronger than <B>?*",
    "✅  *Move <candidate> to interview*  ·  *Reject <candidate>*",
    "✉️  *Draft outreach to <candidate>*",
  ].join("\n");
}
