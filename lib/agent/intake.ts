import { createJd } from "@/lib/jd";
import { parseJdText, coerceMlMode, type MlMode } from "@/lib/jd-parse";
export { UNSUPPORTED_ROLE_MESSAGE } from "@/lib/jd-parse";
import { buildOneLiner, cleanTitle } from "@/lib/jd-role-fit";
import {
  WORK_AUTH_OPTIONS,
  LOCATION_TYPES,
  EMPLOYMENT_TYPES,
  workAuthChoiceToBooleans,
  type WorkAuthChoice,
} from "@/lib/jd-options";
import { logAgentRun } from "@/lib/agent/audit";
import type { AuditMeta } from "@/lib/agent/types";

/**
 * Shared intake (create-a-JD) helpers — the confirm-and-fill core (ADR-010 Phase 3).
 *
 * Extracted out of `loop.ts` so BOTH front doors call ONE implementation (the
 * no-fork contract, ADR-012): the router path (`loop.ts` proposeIntake/editIntake/
 * confirmIntake) and the tool-calling path (`tools.ts` create_intake) both build the
 * SAME draft, validate the SAME gaps, and mint via the SAME `finalizeIntake` →
 * `createJd`. A bot-minted JD therefore always carries role_fit + work_auth, the way
 * a web JD does (the gap CLAUDE.md warns about). Nothing here writes until a confirm.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export type IntakeFields = {
  title?: string;
  seniority?: string;
  location_type?: string;
  employment_type?: string;
  yoe_required?: string;
  work_auth_us_required?: boolean;
  work_auth_eu_required?: boolean;
  work_auth_provided?: boolean;
};

export type IntakeDraft = {
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
  /** ADR-013: role-function facet emitted by the JD parser (builds vs integrates
   *  vs both vs n/a). Threaded through to createJd so a bot-minted JD carries the
   *  same ml_mode a web-minted one does. */
  ml_mode: MlMode;
  /** false only when the parsed JD was explicitly classified as outside
   *  software/data/ML/QA. Callers check this BEFORE proposing/minting and reject
   *  with UNSUPPORTED_ROLE_MESSAGE instead — never persisted, never a JD field. */
  in_scope: boolean;
  /** Applicant cap — the intake link closes when it's reached, and shortlisting
   *  unlocks at 60% of it. null until the recruiter sets it; createJd defaults to
   *  100 if it's never provided (e.g. they confirm before answering). */
  submission_cap: number | null;
  /** Free-text extras the recruiter asked to mention ONLY in the shareable
   *  "paste-ready" message — e.g. office city, compensation, perks. This is NOT a
   *  JD field: finalizeIntake deliberately omits it from createJd, so it never lands
   *  on the role and is never used for matching or filtering. Empty when unset. */
  share_note: string;
};

/** Normalized builder inputs — the union both callers map onto (the router's
 *  IntakeFields, and the tool's explicit args). `parseText`, when present, runs the
 *  SAME web parse pipeline for skills/role_fit; explicit fields overlay it. */
export type DraftInput = {
  parseText?: string;
  title?: string;
  seniority?: string;
  location_type?: string;
  employment_type?: string;
  yoe_required?: string;
  workAuth?: { us: boolean; eu: boolean; provided: boolean; answered: boolean };
  submission_cap?: number | null;
  /** Free text to mention only in the shareable message (city, comp, perks). */
  share_note?: string;
};

/** Parse the recruiter's request into a full draft (same parse the web flow uses),
 *  overlaying any fields the caller supplied explicitly. The JD parser never
 *  produces work-auth, so `workAuth.answered` is the caller's call. */
export async function assembleDraft(input: DraftInput): Promise<IntakeDraft> {
  let parsed: Awaited<ReturnType<typeof parseJdText>> | null = null;
  if (input.parseText && input.parseText.trim()) {
    try {
      parsed = await parseJdText(input.parseText);
    } catch {
      parsed = null;
    }
  }
  return {
    title: input.title || parsed?.title || "New role",
    seniority: input.seniority ?? parsed?.seniority ?? "",
    role_category: parsed?.role_category ?? "",
    tech_stack: parsed?.tech_stack ?? [],
    location_type: input.location_type ?? parsed?.location_type ?? "",
    employment_type: input.employment_type ?? parsed?.employment_type ?? "",
    yoe_required: input.yoe_required ?? parsed?.yoe_required ?? "",
    work_auth_us_required: Boolean(input.workAuth?.us),
    work_auth_eu_required: Boolean(input.workAuth?.eu),
    work_auth_provided: Boolean(input.workAuth?.provided),
    work_auth_answered: Boolean(input.workAuth?.answered),
    primary: parsed?.primary ?? [],
    secondary: parsed?.secondary ?? [],
    tertiary: parsed?.tertiary ?? [],
    ml_mode: parsed?.ml_mode ?? "n/a",
    in_scope: parsed?.in_scope ?? true,
    submission_cap: input.submission_cap ?? null,
    share_note: input.share_note?.trim() || "",
  };
}

/** Rehydrate a draft from a persisted/serialized record (pendingIntake, or a
 *  confirm-button payload). Mirrors IntakeDraft field-for-field. */
export function asDraft(p: Record<string, unknown> | null): IntakeDraft | null {
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
    ml_mode: coerceMlMode(p.ml_mode),
    // Rehydrated drafts already passed the scope gate at propose time; default true.
    in_scope: p.in_scope !== false,
    submission_cap: typeof p.submission_cap === "number" ? (p.submission_cap as number) : null,
    share_note: s("share_note"),
  };
}

/** Merge a router edit (only the fields it returned) onto an existing draft. */
export function mergeEdit(d: IntakeDraft, intake: IntakeFields): IntakeDraft {
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

/** Did the recruiter actually provide a role/JD, or just ask for "a link"? The JD
 *  parser hallucinates a plausible role from empty input (that's how "create an
 *  intake link" once produced a random Software Engineer), so gate on real content
 *  — a title the caller extracted, or enough text to be a description — and ask for
 *  the JD rather than fabricate one. */
export function hasRoleContent(title: string | undefined, text: string): boolean {
  if (title && title.trim()) return true;
  return text.trim().length > 60;
}

export function askForJd(): string {
  return [
    "📝 Sure — paste the job description and I'll set up the intake link.",
    "Or describe the role in a line — *title, seniority, and the key stack* (e.g. _“senior backend engineer, Go + Postgres, remote”_) — and I'll fill in the rest, then ask about anything missing.",
  ].join("\n");
}

/**
 * The fields the recruiter must settle that the JD can't fill in, in the order we
 * ask for any still missing. Work-auth is never in a JD's parsed output, so it's
 * asked unless stated; location/employment are asked only when the parser left them
 * blank; the applicant limit (never in a JD) is asked last, like the web confirm
 * page's Pipeline Settings. Everything else stays autofilled.
 */
export const GAP_ORDER = ["work_auth", "location_type", "employment_type", "applicant_limit"] as const;
export type Gap = (typeof GAP_ORDER)[number];

/** First field still needing input, in GAP_ORDER, or null when the draft is complete. */
export function firstGap(d: IntakeDraft): Gap | null {
  if (!d.work_auth_answered && !(d.work_auth_us_required || d.work_auth_eu_required || d.work_auth_provided)) {
    return "work_auth";
  }
  if (!d.location_type.trim()) return "location_type";
  if (!d.employment_type.trim()) return "employment_type";
  if (d.submission_cap == null) return "applicant_limit";
  return null;
}

/** The numbered question for a gap — options come straight from lib/jd-options
 *  (same choices the web confirm page shows), so the recruiter just replies a number. */
export function askGap(g: Gap): string {
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
  if (g === "employment_type") {
    return [
      "💼 What's the *employment type*? Reply with the number:",
      ...EMPLOYMENT_TYPES.map((o, i) => `${i + 1}. ${o}`),
    ].join("\n");
  }
  return "🔢 Last one — how many applicants should the link accept before it closes? Reply with a number (e.g. *50*). Shortlisting unlocks at 60% of that.";
}

/** Interpret a reply to a gap question as a pick (a number, or the option label).
 *  Returns the updated draft, or null if it isn't a recognizable answer for that
 *  field (so the caller falls back to its LLM path for edits/confirm/cancel). */
export function applyGapAnswer(d: IntakeDraft, gap: Gap, text: string): IntakeDraft | null {
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

  if (gap === "employment_type") {
    let v: string | null = null;
    if (n >= 1 && n <= EMPLOYMENT_TYPES.length) v = EMPLOYMENT_TYPES[n - 1];
    else if (/full.?time|\bft\b/.test(t)) v = "Full-time";
    else if (/intern/.test(t)) v = "Intern";
    else if (/contract/.test(t)) v = "Contract";
    if (!v) return null;
    return { ...d, employment_type: v };
  }

  // applicant_limit — first positive integer anywhere ("50", "cap 50", "limit: 50")
  const capMatch = t.match(/(\d{1,7})/);
  const cap = capMatch ? parseInt(capMatch[1], 10) : NaN;
  if (!Number.isInteger(cap) || cap < 1) return null;
  return { ...d, submission_cap: cap };
}

/** The running draft summary — what the JD autofilled, with unfilled picks
 *  flagged. No trailing instruction; the caller appends the next gap question
 *  or the confirm footer. */
export function draftSummary(d: IntakeDraft): string {
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
  const lines = [
    `📋 Draft intake link — *${d.title}*`,
    `• Seniority: ${set(d.seniority)}`,
    `• Location: ${set(d.location_type)}`,
    `• Type: ${set(d.employment_type)}`,
    `• Experience: ${set(d.yoe_required)}`,
    `• Work auth: ${auth}`,
    `• Applicant limit: ${d.submission_cap != null ? String(d.submission_cap) : "_to be set_"}`,
    `• Skills: ${skills.length ? skills.join(", ") : "_none detected_"}`,
  ];
  if (d.share_note.trim()) lines.push(`• Also in the share message: ${d.share_note.trim()}`);
  return lines.join("\n");
}

/** The public intake/application URL for a minted role. */
export function intakeLink(jobId: string): string {
  return `${APP_URL}/candidate?jobId=${jobId}`;
}

/** The detail bundle the shareable post is composed from. An IntakeDraft (create
 *  time) and a loaded JD (existing link) both satisfy this shape. */
export type ShareDetails = {
  title: string;
  seniority?: string;
  location_type?: string;
  employment_type?: string;
  yoe_required?: string;
  work_auth_us_required?: boolean;
  work_auth_eu_required?: boolean;
  work_auth_provided?: boolean;
  /** Free-text extras (office city, compensation, perks) — appended after the
   *  structured facts, never written to the JD. */
  share_note?: string;
};

/** Compact "· "-joined line of the role's public-facing facts followed by the
 *  recruiter's free-text extras. Applicant limit + skills are intentionally left out
 *  — they aren't for a public post. */
function shareDetailLine(d: ShareDetails): string {
  const bits: string[] = [];
  if (d.seniority?.trim()) bits.push(d.seniority.trim());
  if (d.location_type?.trim()) bits.push(d.location_type.trim());
  if (d.employment_type?.trim()) bits.push(d.employment_type.trim());
  if (d.yoe_required?.trim()) bits.push(d.yoe_required.trim());
  if (d.work_auth_us_required) bits.push("US work auth required");
  else if (d.work_auth_eu_required) bits.push("EU work auth required");
  else if (d.work_auth_provided) bits.push("Visa sponsorship available");
  const note = (d.share_note ?? "").trim();
  if (note) bits.push(note);
  return bits.join(" · ");
}

/** The recruiter-facing "paste-ready" blurb for a role's intake link — title, the
 *  FULL compact detail line, then the link. `share_note` carries free-text extras
 *  (city, comp, perks) that never touch the JD. One builder, shared by finalizeIntake
 *  (create time) and the share_message tool (an existing link) — no fork. */
export function buildShareMessage(link: string, d: ShareDetails): string {
  const detail = shareDetailLine(d);
  return [
    "Paste-ready for your network:",
    `> We're hiring a ${d.title}! Apply here and you'll hear back fast 👇`,
    ...(detail ? [`> ${detail}`] : []),
    `> ${link}`,
  ].join("\n");
}

export const CONFIRM_FOOTER =
  "Reply to change anything (e.g. *“senior”*, *“5+ years”*), or say *create it* to mint the link.";

/** Mint the JD from a confirmed draft — the same complete payload a web JD gets.
 *  Org/user are injected by the caller (never from model output); `audit` carries
 *  the Slack context for the agent_runs action record. */
export async function finalizeIntake(
  orgId: string,
  userId: string,
  d: IntakeDraft,
  audit: AuditMeta
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
    ...(d.submission_cap != null ? { submissionCap: d.submission_cap } : {}),
    role_fit: {
      title: cleanTitle(d.title),
      primary: d.primary,
      secondary: d.secondary,
      tertiary: d.tertiary,
      one_liner: buildOneLiner(d.title, d.primary, d.secondary, d.tertiary),
    },
    ml_mode: d.ml_mode,
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
    teamId: audit.teamId,
    channel: audit.channel,
    slackUserId: audit.slackUserId,
    detail: { action: "create_intake", jobId: result.jobId, title: d.title },
  });

  const link = intakeLink(result.jobId);
  return [
    `✅ Done — intake link for *${d.title}*:`,
    link,
    "",
    buildShareMessage(link, d),
  ].join("\n");
}
