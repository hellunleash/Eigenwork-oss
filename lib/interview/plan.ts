/**
 * InterviewPlan — the per-role, founder-customizable interview config (Phase 2).
 *
 * Stored at `jds/{id}.interviewPlan`. The founder edits any of this per role
 * *before starting* (via EigenBot in Slack; web is the peer) — rounds are NOT a
 * fixed 4. Pure module (no Firestore) so it's unit-testable and safe to import
 * anywhere; the partial-safe persistence writer lives in plan-writer.ts.
 *
 * NOTE: interviewPlan is deliberately NOT part of lib/jd.ts buildJdPayload — that
 * builder rewrites the whole doc body, which would clobber the plan (critic blocker
 * 1y). All interviewPlan writes go through updateInterviewPlan (dot-path merge).
 */

export type SubmissionFormat = "repo" | "upload" | "link";

export type ScreenConfig = {
  questionCount: number;
  codeCount: number;
  probeCount: number;
  difficulty: "easy" | "medium" | "hard";
  /** Free-text focus / stack emphasis the founder can set. */
  focus?: string;
  /** 0–100; the scorer marks suggestedAdvance when overall >= this. */
  advanceThreshold?: number;
};

export type TakeHomeConfig = {
  enabled: boolean;
  prompt?: string;
  whatGoodLooksLike?: string;
  timeboxHours?: number;
  submissionFormat?: SubmissionFormat;
  /** Per-role toggle for the submission↔level inconsistency flag (Arhaan undecided
   *  → defaults off; founder flips it on later). */
  inconsistencyFlag?: boolean;
  /** 0–100; the scorer marks suggestedAdvance when overall >= this (defaults to 60). */
  advanceThreshold?: number;
};

export type SystemDesignConfig = {
  enabled: boolean;
  prompt?: string;
  rubricEmphasis?: string;
  /** 0–100; the scorer marks suggestedAdvance when overall >= this (defaults to 60). */
  advanceThreshold?: number;
};

/** The founder-chosen ordered round set. introCall + final are human/bookkeeping;
 *  screen / takeHome / systemDesign are app-run. */
export type RoundKind = "introCall" | "screen" | "takeHome" | "systemDesign" | "final";

export type InterviewPlan = {
  rounds: RoundKind[];
  screen: ScreenConfig;
  takeHome: TakeHomeConfig;
  systemDesign: SystemDesignConfig;
};

/**
 * Sensible defaults, seniority-aware. Senior (yoe > 2) gets system design on by
 * default — it's the senior maturity signal and needs no GitHub; junior gets it off.
 * The founder overrides any of this per role before starting.
 */
export function defaultInterviewPlan(senior: boolean): InterviewPlan {
  return {
    rounds: senior
      ? ["introCall", "screen", "takeHome", "systemDesign", "final"]
      : ["introCall", "screen", "takeHome", "final"],
    screen: { questionCount: 5, codeCount: 2, probeCount: 3, difficulty: "medium" },
    takeHome: { enabled: true, submissionFormat: "repo", inconsistencyFlag: false },
    systemDesign: { enabled: senior },
  };
}

/** The app-run round keys (the rounds the engine invites/scores — introCall/final are human). */
export type AppRoundKey = "screen" | "takeHome" | "systemDesign";

/**
 * PURE. The app-run rounds this plan will actually run, in plan order: `screen` is
 * always-on when planned; takeHome/systemDesign also require their `enabled` flag.
 * ONE home for "which rounds count" — the report's completeness math and the
 * recruiter progress UI both read this, so they can never disagree.
 */
export function plannedAppRounds(plan: InterviewPlan): AppRoundKey[] {
  const out: AppRoundKey[] = [];
  for (const r of plan.rounds) {
    if (r === "screen") out.push("screen");
    else if (r === "takeHome" && plan.takeHome.enabled) out.push("takeHome");
    else if (r === "systemDesign" && plan.systemDesign.enabled) out.push("systemDesign");
  }
  return out;
}

/**
 * Build a PARTIAL-SAFE Firestore dot-path update for interviewPlan (critic blocker
 * 1y). Returns only `interviewPlan.<subKey>` entries for the supplied top-level
 * keys — NEVER a bare `interviewPlan` key (which would replace the whole map and
 * clobber sibling config authored from another surface). Drops `undefined`
 * (Firestore rejects it). Writing one sub-key (e.g. takeHome from Slack) preserves
 * siblings (e.g. a systemDesign authored on the web).
 */
export function buildInterviewPlanUpdate(partial: Partial<InterviewPlan>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    out[`interviewPlan.${key}`] = value;
  }
  return out;
}
