/**
 * Stage-4 system design (Phase 2 — docs/phase2-plan.md). PURE builders + normalizers
 * (no Firestore/LLM); the model wrapper lives in systemdesign-run.ts, so this file is
 * unit-tested by scripts/qa-interview-foundation.ts with no env/network.
 *
 * This is the SENIOR maturity signal — it needs no GitHub (yoe>2 collects none), so a
 * candidate answers a design SCENARIO in free text and we score the JUDGMENT, not
 * recall. 2026 field consensus (Hello Interview / Exponent / DesignGurus): a handful
 * of axes where TRADE-OFF REASONING is weighted heaviest at senior level — a justified
 * choice ("NoSQL for write scale, tolerate eventual consistency") beats naming a tech.
 * Recruiter authors the scenario (jds.interviewPlan.systemDesign.prompt); if absent we
 * generate one grounded in the role + (senior) the candidate's own domain. The
 * candidate's response is injection-fenced.
 */
import { FENCE, SCORE_INTEGRITY, boundedJson, cardBlock, type InterviewCard } from "@/lib/interview/prompt-util";
import { normalizeScorecard, DEFAULT_ADVANCE_THRESHOLD } from "@/lib/interview/scorecard";
import type { Scorecard } from "@/lib/interview/rounds";

/** The system-design rubric — 5 dimensions, trade-off reasoning weighted heaviest. */
export const SYSTEM_DESIGN_RUBRIC = [
  "Score this system-design response on these 5 dimensions (0–100 each). This is a JUDGMENT test, not a",
  "knowledge test — reward reasoning over buzzwords:",
  "1. requirements_and_scoping — do they clarify functional + non-functional requirements, constraints, and",
  "   rough scale estimates before designing, instead of jumping to a solution?",
  "2. high_level_architecture — are the core components, data flow, and APIs coherent and correct for the problem?",
  "3. deep_dive_and_data — data model, storage choice, and the key bottleneck/algorithm handled with real depth?",
  "4. tradeoffs_and_justification (WEIGHT: highest) — do they weigh alternatives and JUSTIFY choices",
  "   (consistency vs availability, cost, latency, complexity)? Naming a technology without a justified trade-off",
  "   scores low; a defended trade-off scores high, even if you'd have chosen differently.",
  "5. scalability_and_reliability — scaling strategy, failure modes, and how they'd monitor/operate it.",
].join("\n");

export type SystemDesignSetupContext = {
  roleTitle: string;
  senior: boolean;
  card?: InterviewCard | null;
  recruiterPrompt?: string | null;
  rubricEmphasis?: string | null;
  /** Senior grounding — design a scenario in a domain the candidate actually claims. */
  workHistory?: unknown;
  roleSkills?: string[];
  roleRequirements?: string;
};

export type SystemDesignScoreContext = {
  roleTitle: string;
  senior: boolean;
  prompt: string;
  rubricEmphasis?: string | null;
  response: string;
  card?: InterviewCard | null;
  advanceThreshold?: number;
};

/** PURE. Build the scenario-generation prompt (used only when the recruiter didn't
 *  author one). Senior scenarios are grounded in the candidate's own domain. */
export function buildSystemDesignGenPrompt(ctx: SystemDesignSetupContext): string {
  const grounding = ctx.senior
    ? `WORK HISTORY (ground the scenario in a domain this senior candidate actually claims, so it tests depth, not trivia):\n${boundedJson(ctx.workHistory)}`
    : `ROLE SKILLS:\n${JSON.stringify(ctx.roleSkills ?? [])}`;
  return [
    `You are authoring ONE system-design scenario for a ${ctx.roleTitle} candidate (${ctx.senior ? "senior" : "junior"}).`,
    FENCE,
    "Write a realistic, appropriately-scoped design problem (2–4 sentences) that has room for meaningful trade-offs (scale, consistency, cost). Do NOT include the answer.",
    ctx.roleRequirements ? `ROLE REQUIREMENTS (fit the scenario to these — seniority, stack, domain):\n${ctx.roleRequirements}` : "",
    ctx.rubricEmphasis ? `EMPHASIS the recruiter wants tested: ${ctx.rubricEmphasis}` : "",
    cardBlock(ctx.card),
    grounding,
    'Return JSON: {"prompt":string} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Resolve the scenario — the recruiter-authored prompt wins over the generated one. */
export function normalizeSystemDesignSetup(
  json: Record<string, unknown>,
  opts: { recruiterPrompt?: string | null }
): { prompt: string } {
  const recruiter = typeof opts.recruiterPrompt === "string" ? opts.recruiterPrompt.trim() : "";
  const generated = typeof json.prompt === "string" ? json.prompt.trim() : "";
  return {
    prompt:
      recruiter ||
      generated ||
      "Design a URL shortener that handles 10,000 writes/sec and 100M reads/day. Walk through requirements, the high-level architecture, your data model, and the key trade-offs.",
  };
}

/** PURE. Build the system-design scoring prompt (response injection-fenced). */
export function buildSystemDesignScorePrompt(ctx: SystemDesignScoreContext): string {
  return [
    `Score this ${ctx.senior ? "senior" : "junior"} candidate's system-design response for a ${ctx.roleTitle} role.`,
    FENCE,
    SYSTEM_DESIGN_RUBRIC,
    SCORE_INTEGRITY,
    ctx.rubricEmphasis ? `EXTRA EMPHASIS: ${ctx.rubricEmphasis}` : "",
    cardBlock(ctx.card),
    `SCENARIO:\n${ctx.prompt}`,
    `CANDIDATE RESPONSE:\n${ctx.response || "(none provided)"}`,
    'Return JSON: {"overall":0-100,"dimensions":[{"name":string,"score":0-100,"max":100,"note":string}],"summary":string,"flags":[string]} — no other keys.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** PURE. Normalize the system-design scorecard (shared logic; suggestedAdvance from threshold). */
export function normalizeSystemDesignScorecard(json: Record<string, unknown>, advanceThreshold = DEFAULT_ADVANCE_THRESHOLD): Scorecard {
  return normalizeScorecard(json, advanceThreshold);
}
