/**
 * Stage-3 screen — the two model-calling wrappers (Phase 2).
 *
 * Split from screen.ts on purpose: this file imports lib/interview/llm →
 * openai-client, which instantiates the OpenAI client at module load. Keeping the
 * builders/normalizers pure in screen.ts lets the QA script exercise them with no
 * env and no network (zero prod risk). Mirrors the plan.ts (pure) / plan-writer.ts
 * (IO) split.
 */
import { runInterviewJson } from "@/lib/interview/llm";
import {
  buildScreenGenPrompt,
  buildScreenScorePrompt,
  normalizeScreenQuestions,
  normalizeScreenScorecard,
  type ScreenGenContext,
  type ScreenScoreContext,
} from "@/lib/interview/screen";
import type { Scorecard, ScreenQuestion } from "@/lib/interview/rounds";

export async function generateScreenQuestions(ctx: ScreenGenContext): Promise<ScreenQuestion[]> {
  const { json } = await runInterviewJson(buildScreenGenPrompt(ctx), 3000);
  return normalizeScreenQuestions(json, ctx.screen);
}

export async function scoreScreen(ctx: ScreenScoreContext): Promise<Scorecard> {
  // Interactive: the candidate is waiting on submit, so use the standard tier for
  // lower latency (invite-time generation stays on the cheaper flex path).
  const { json } = await runInterviewJson(buildScreenScorePrompt(ctx), 3000, { interactive: true });
  return normalizeScreenScorecard(json, ctx.advanceThreshold);
}
