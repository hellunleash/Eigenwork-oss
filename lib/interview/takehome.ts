/**
 * Stage-4 take-home (Phase 2 — docs/phase2-plan.md). PURE builders + normalizers
 * (no Firestore/LLM/GitHub); the model + repo-signal wrappers live in takehome-run.ts,
 * so this file is unit-tested by scripts/qa-interview-foundation.ts with no env/network.
 *
 * Arhaan's requirement: "AI writes good code now — evaluate the CODE *and the THINKING*
 * that went into building it; comments aren't a good originality signal, so lean on
 * heuristics." We do exactly that:
 *   - CODE + heuristics come from the DETERMINISTIC lib/github-signals.ts summary
 *     (commit trajectory, authorship share, all-in-one-day, burst-thrash, rework,
 *     hardening density) — raw source is NEVER sent to an LLM.
 *   - THINKING comes from the candidate's own walkthrough + probe answers, which are
 *     scored for COHERENCE against that deterministic signal. Fabricated / outsourced
 *     work fails the coherence check (2026 field signal: AI-leaners "rarely answer at
 *     any depth" and can't narrate their own specific build).
 *   - One probe is an EXTENSION ("now change X") — genuine authors adapt under a new
 *     constraint; non-authors stall.
 * Recruiter authors the assignment (jds.interviewPlan.takeHome.prompt); if absent we
 * generate a scoped one. Candidate-derived text is injection-fenced.
 */
import { FENCE, SCORE_INTEGRITY, cardBlock, type InterviewCard } from "@/lib/interview/prompt-util";
import { normalizeScorecard, DEFAULT_ADVANCE_THRESHOLD } from "@/lib/interview/scorecard";
import type { Scorecard, ScreenAnswer, ScreenQuestion } from "@/lib/interview/rounds";

/** Default count of reactive probe questions presented alongside the submission. */
export const TAKEHOME_PROBE_COUNT = 3;

/** Repo-signal availability, mirrored from lib/github-signals EsqSignalStatus so a
 *  missing/private repo degrades the scorer instead of zeroing a real submission. */
export type RepoSignalStatus = "ok" | "unavailable" | "no_evidence";

/** The take-home scoring rubric — thinking + authenticity weighted OVER the artifact. */
export const TAKEHOME_RUBRIC = [
  "Score this take-home on these dimensions (0–100 each). AI can produce correct code, so weight the",
  "candidate's THINKING and the AUTHENTICITY of their build over the polish of the artifact:",
  "1. reasoning_and_tradeoffs (WEIGHT: highest) — does the walkthrough + probe show real design judgment:",
  "   weighing alternatives, justifying choices, handling edge cases, and adapting to the extension prompt?",
  "2. thinking_authenticity (WEIGHT: high) — does their narrative COHERE with the deterministic repo signal?",
  "   Claims of careful iteration against all_in_one_day / a single commit / low authorship_share, or a",
  "   walkthrough that can't specifically explain what's actually in the repo, is a STRONG negative — an",
  "   LLM-outsourced submission narrates its own build vaguely. Reward specific, verifiable narration.",
  "3. requirement_fit — does the submission actually address the assignment and what-good-looks-like?",
  "4. code_quality — from the deterministic signal only (architecture, completeness, hardening) — NOT raw code.",
  "5. communication — is the walkthrough clear and well-structured?",
].join("\n");

export type TakeHomeSetupContext = {
  roleTitle: string;
  senior: boolean;
  card?: InterviewCard | null;
  /** Recruiter-authored assignment; when present we do NOT invent one. */
  recruiterPrompt?: string | null;
  whatGoodLooksLike?: string | null;
  timeboxHours?: number | null;
  roleSkills?: string[];
  roleRequirements?: string;
  probeCount?: number;
};

export type TakeHomeScoreContext = {
  roleTitle: string;
  senior: boolean;
  assignmentPrompt: string;
  whatGoodLooksLike?: string | null;
  repoStatus: RepoSignalStatus;
  /** Deterministic metadata+regex digest from lib/github-signals (never raw code). */
  repoSummaryText?: string | null;
  walkthrough: string;
  probeQuestions: ScreenQuestion[];
  probeAnswers: ScreenAnswer[];
  card?: InterviewCard | null;
  advanceThreshold?: number;
};

/** Deterministic fallback probes — used to pad if the model underproduces, so the
 *  self-narration anti-gaming signal is always present. The last is the EXTENSION. */
const FALLBACK_PROBES: string[] = [
  "What was the single hardest trade-off you made? What did you reject, and why?",
  "Which part of your solution is riskiest or most likely to break under load, and how would you harden it?",
  "If the input scale grew 100× tomorrow, what specifically would you change first, and what would break if you didn't?",
];

/** PURE. Build the take-home setup prompt: produce reactive probe questions (and,
 *  only if the recruiter didn't author one, a scoped assignment). */
export function buildTakeHomeSetupPrompt(ctx: TakeHomeSetupContext): string {
  const probeCount = ctx.probeCount ?? TAKEHOME_PROBE_COUNT;
  const hasPrompt = !!ctx.recruiterPrompt && ctx.recruiterPrompt.trim().length > 0;
  return [
    `You are setting up a take-home for a ${ctx.roleTitle} candidate (${ctx.senior ? "senior" : "junior"}).`,
    FENCE,
    hasPrompt
      ? `The recruiter already authored the assignment (below). Do NOT invent a new one — read it and craft probe questions grounded in it.\nASSIGNMENT:\n${ctx.recruiterPrompt}`
      : `No assignment was authored. Produce a scoped, self-contained take-home a strong candidate could finish in ${ctx.timeboxHours ?? 4} hours, tailored to the role${ctx.roleSkills?.length ? ` (skills: ${ctx.roleSkills.join(", ")})` : ""}. It must be buildable as a small public git repo.`,
    ctx.roleRequirements ? `ROLE REQUIREMENTS (tailor the assignment + probes to these — seniority, stack, must-haves):\n${ctx.roleRequirements}` : "",
    ctx.whatGoodLooksLike ? `WHAT GOOD LOOKS LIKE:\n${ctx.whatGoodLooksLike}` : "",
    cardBlock(ctx.card),
    `Produce EXACTLY ${probeCount} probe questions the candidate answers WHEN THEY SUBMIT, to expose the thinking behind their build (an AI-outsourced submission can't narrate its own build at depth):`,
    "- At least one must force them to justify a concrete trade-off (what they chose AND what they rejected).",
    "- At least one must be an EXTENSION: 'now change X / add constraint Y — what would you change and what breaks?' (genuine authors adapt; non-authors stall).",
    hasPrompt
      ? 'Return JSON: {"probeQuestions":[{"prompt":string}, ...]} — no other keys.'
      : 'Return JSON: {"assignment":string,"probeQuestions":[{"prompt":string}, ...]} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Resolve the assignment (recruiter's wins) + coerce probe questions to stable
 *  ids, padding from FALLBACK_PROBES so there are always `probeCount` of them. */
export function normalizeTakeHomeSetup(
  json: Record<string, unknown>,
  opts: { recruiterPrompt?: string | null; probeCount?: number }
): { prompt: string; probeQuestions: ScreenQuestion[] } {
  const probeCount = opts.probeCount ?? TAKEHOME_PROBE_COUNT;
  const recruiter = typeof opts.recruiterPrompt === "string" ? opts.recruiterPrompt.trim() : "";
  const generated = typeof json.assignment === "string" ? json.assignment.trim() : "";
  const prompt = recruiter || generated || "Build a small, well-scoped project that demonstrates your approach to this role. Include a short README explaining your design decisions.";

  const raw = Array.isArray(json.probeQuestions) ? json.probeQuestions : [];
  const prompts: string[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const p = (q as { prompt?: unknown }).prompt;
    if (typeof p === "string" && p.trim()) prompts.push(p.trim());
  }
  for (const fb of FALLBACK_PROBES) {
    if (prompts.length >= probeCount) break;
    if (!prompts.includes(fb)) prompts.push(fb);
  }
  const probeQuestions: ScreenQuestion[] = prompts
    .slice(0, probeCount)
    .map((prompt, i) => ({ id: `p${i + 1}`, kind: "probe", prompt }));
  return { prompt, probeQuestions };
}

/** Render the deterministic repo-signal block (or an explicit "missing" note that
 *  tells the scorer to fall back to the narrative + add a flag). */
function repoSignalBlock(ctx: TakeHomeScoreContext): string {
  if (ctx.repoStatus === "ok" && ctx.repoSummaryText && ctx.repoSummaryText.trim()) {
    return `DETERMINISTIC REPO SIGNAL (metadata + commit history + regex counts — NOT source code; use it to corroborate or contradict the candidate's narrative):\n${ctx.repoSummaryText}`;
  }
  return [
    "DETERMINISTIC REPO SIGNAL: unavailable — the submitted repository could not be read (private, invalid, or empty).",
    "Score on the walkthrough + probe answers only, cap code_quality low for lack of evidence, and ADD a flag noting the code signal was missing.",
  ].join("\n");
}

/** PURE. Build the take-home scoring prompt. */
export function buildTakeHomeScorePrompt(ctx: TakeHomeScoreContext): string {
  const qa = ctx.probeQuestions
    .map((q) => {
      const a = ctx.probeAnswers.find((x) => x.id === q.id)?.text ?? "(no answer)";
      return `Q: ${q.prompt}\nA: ${a}`;
    })
    .join("\n\n");
  return [
    `Score this ${ctx.senior ? "senior" : "junior"} candidate's take-home for a ${ctx.roleTitle} role.`,
    FENCE,
    TAKEHOME_RUBRIC,
    SCORE_INTEGRITY,
    `ASSIGNMENT:\n${ctx.assignmentPrompt}`,
    ctx.whatGoodLooksLike ? `WHAT GOOD LOOKS LIKE:\n${ctx.whatGoodLooksLike}` : "",
    cardBlock(ctx.card),
    repoSignalBlock(ctx),
    `CANDIDATE WALKTHROUGH (their own explanation of their build):\n${ctx.walkthrough || "(none provided)"}`,
    `PROBE (question → candidate answer):\n${qa || "(no probe answers)"}`,
    'Return JSON: {"overall":0-100,"dimensions":[{"name":string,"score":0-100,"max":100,"note":string}],"summary":string,"flags":[string]} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Normalize the take-home scorecard (shared logic; suggestedAdvance from threshold). */
export function normalizeTakeHomeScorecard(json: Record<string, unknown>, advanceThreshold = DEFAULT_ADVANCE_THRESHOLD): Scorecard {
  return normalizeScorecard(json, advanceThreshold);
}
