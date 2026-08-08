/**
 * Stage-3 AI technical screen (Phase 2 — docs/phase2-plan.md).
 *
 * NEW rubric, NOT the ETI résumé rubric (the ETI rubric scores a résumé for
 * hiring-signal; a screen answer needs its own criteria). Reuses only the shared
 * machinery via lib/interview/llm.ts (runInterviewJson → runJsonModel).
 *
 * Design (Arhaan): exactly `screen.questionCount` questions = `codeCount` coding +
 * `probeCount` ETI-grounded probes. Seniority-branched grounding — junior probes on
 * github_metrics + card; senior probes on work_history + role (NEVER a repo, since
 * yoe>2 has no GitHub). Scoring weights THINKING over artifact (AI writes good code
 * now) and presses on the flag the engine already raised. Candidate-derived context
 * + answers are injection-fenced. Prompt builders + normalizers are PURE (unit-tested
 * by scripts/qa-interview-foundation.ts); only the two wrappers hit the model.
 */
import type { ScreenConfig } from "@/lib/interview/plan";
import type { Scorecard, ScreenAnswer, ScreenQuestion } from "@/lib/interview/rounds";
import { FENCE, SCORE_INTEGRITY, boundedJson, cardBlock, type InterviewCard } from "@/lib/interview/prompt-util";
import { normalizeScorecard, DEFAULT_ADVANCE_THRESHOLD } from "@/lib/interview/scorecard";

/** The screen scoring rubric — thinking-over-artifact weighted. Kept as one const so
 *  it's the single place the criteria live. */
export const SCREEN_RUBRIC = [
  "Score the candidate's screen answers on these dimensions (0–100 each), weighting REASONING over the raw artifact",
  "because AI can produce correct code — what separates candidates is how they think:",
  "1. reasoning_and_tradeoffs (WEIGHT: highest) — do they justify choices, weigh alternatives, handle edge cases?",
  "2. depth_on_own_work — can they coherently explain the work the signal surfaced, and reconcile any flag? Vague or",
  "   contradictory narration about their own claimed work is a strong negative (an LLM can't fake a specific one).",
  "3. technical_correctness — are the coding answers sound?",
  "4. communication — clarity and structure.",
].join("\n");

export type ScreenCard = InterviewCard;

export type ScreenGenContext = {
  candidateName: string;
  roleTitle: string;
  senior: boolean; // yoe > 2 (no GitHub collected)
  screen: ScreenConfig;
  card?: ScreenCard | null;
  workHistory?: unknown; // BOTH tracks — a junior still has claimed work to probe
  githubMetrics?: unknown; // junior only (yoe>2 collects no GitHub)
  roleSkills?: string[];
  /** Composed role-requirements block (seniority, stack, must-haves) so questions
   *  are calibrated to the role, not generic. */
  roleRequirements?: string;
  /** The ETI engine's OWN reasoning (block justifications + overlord risk verdict) the
   *  card was distilled from — richer probe material than the 3-line card alone. */
  etiReasoning?: string;
};

export type ScreenScoreContext = {
  roleTitle: string;
  senior: boolean;
  questions: ScreenQuestion[];
  answers: ScreenAnswer[];
  card?: ScreenCard | null;
  /** 0–100; suggestedAdvance is set when overall >= this. */
  advanceThreshold?: number;
};

/** PURE. Build the screen-question generation prompt. Seniority-branched grounding:
 *  a "GITHUB SIGNAL" block appears for juniors only; seniors get a "WORK HISTORY"
 *  block and an explicit no-repo instruction. */
export function buildScreenGenPrompt(ctx: ScreenGenContext): string {
  const { screen } = ctx;
  // Senior: work history only (yoe>2 collects NO GitHub — never reference a repo).
  // Junior: GitHub signal AND work history (a junior still has claimed work to probe).
  const grounding = ctx.senior
    ? [
        "WORK HISTORY (senior grounding — the candidate has NO code repository, so NEVER ask them to reference a GitHub repo):",
        boundedJson(ctx.workHistory),
      ].join("\n")
    : [
        "GITHUB SIGNAL (their actual GitHub work):",
        boundedJson(ctx.githubMetrics),
        "",
        "WORK HISTORY (their claimed employment — probe on it + reconcile against any flag):",
        boundedJson(ctx.workHistory),
      ].join("\n");

  return [
    `You are generating a technical SCREEN for a ${ctx.roleTitle} candidate (${ctx.senior ? "senior" : "junior"}).`,
    FENCE,
    `Produce EXACTLY ${screen.codeCount} coding questions and ${screen.probeCount} probing questions (${screen.questionCount} total), at ${screen.difficulty} difficulty.`,
    ctx.roleRequirements ? `ROLE REQUIREMENTS (calibrate topic choice AND difficulty to these — seniority, stack, must-have skills):\n${ctx.roleRequirements}` : "",
    `Coding questions: tailored to the role's stack${ctx.roleSkills?.length ? ` (skills: ${ctx.roleSkills.join(", ")})` : ""}; test problem-solving, not trivia; match the seniority above.`,
    "Probing questions: grounded in what the signal already evaluated for THIS candidate — make them narrate and justify their own claimed work, and reconcile any flag. These resist AI cheating: an outsourcer can't coherently narrate work they didn't do.",
    ctx.screen.focus ? `FOCUS: ${ctx.screen.focus}` : "",
    cardBlock(ctx.card),
    ctx.etiReasoning ? `ETI ASSESSMENT (the engine's OWN reasoning that produced the card above — mine it to make probes SPECIFIC and to press on the exact doubts/risks it raised):\n${ctx.etiReasoning}` : "",
    grounding,
    'Return JSON: {"questions":[{"kind":"code"|"probe","prompt":string}, ...]} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Coerce model output into exactly the configured counts of code/probe
 *  questions with stable ids. Best-effort: trims extras, keeps what's valid. */
export function normalizeScreenQuestions(json: Record<string, unknown>, screen: ScreenConfig): ScreenQuestion[] {
  const raw = Array.isArray(json.questions) ? json.questions : [];
  const code: string[] = [];
  const probe: string[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const kind = (q as { kind?: unknown }).kind;
    const prompt = (q as { prompt?: unknown }).prompt;
    if (typeof prompt !== "string" || !prompt.trim()) continue;
    // Normalize the kind: any "cod…" (code/coding/Code) is a coding question; else a probe.
    const kindStr = typeof kind === "string" ? kind.toLowerCase() : "";
    if (kindStr.startsWith("cod")) code.push(prompt.trim());
    else probe.push(prompt.trim());
  }
  const picked: Array<{ kind: "code" | "probe"; prompt: string }> = [
    ...code.slice(0, screen.codeCount).map((prompt) => ({ kind: "code" as const, prompt })),
    ...probe.slice(0, screen.probeCount).map((prompt) => ({ kind: "probe" as const, prompt })),
  ];
  return picked.map((q, i) => ({ id: `q${i + 1}`, kind: q.kind, prompt: q.prompt }));
}

/** PURE. Build the screen-scoring prompt (answers injection-fenced). */
export function buildScreenScorePrompt(ctx: ScreenScoreContext): string {
  const qa = ctx.questions
    .map((q) => {
      const a = ctx.answers.find((x) => x.id === q.id)?.text ?? "(no answer)";
      return `[${q.kind}] Q: ${q.prompt}\nA: ${a}`;
    })
    .join("\n\n");
  return [
    `Score this ${ctx.senior ? "senior" : "junior"} candidate's technical screen for a ${ctx.roleTitle} role.`,
    FENCE,
    SCREEN_RUBRIC,
    SCORE_INTEGRITY,
    cardBlock(ctx.card),
    `SCREEN (question → candidate answer):\n${qa}`,
    'Return JSON: {"overall":0-100,"dimensions":[{"name":string,"score":0-100,"max":100,"note":string}],"summary":string,"flags":[string]} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Normalize a model scorecard. `suggestedAdvance` is computed deterministically
 *  from the threshold (never trusted to the model) — and it's a recommendation only;
 *  advance/reject is always a human click. */
export function normalizeScreenScorecard(json: Record<string, unknown>, advanceThreshold = DEFAULT_ADVANCE_THRESHOLD): Scorecard {
  return normalizeScorecard(json, advanceThreshold);
}
