/**
 * Stage-4 system design — the model wrappers (Phase 2). Split from the pure
 * systemdesign.ts so QA can exercise the builders/normalizers with no env/network.
 */
import { runInterviewJson } from "@/lib/interview/llm";
import {
  buildSystemDesignGenPrompt,
  buildSystemDesignScorePrompt,
  normalizeSystemDesignSetup,
  normalizeSystemDesignScorecard,
  type SystemDesignScoreContext,
  type SystemDesignSetupContext,
} from "@/lib/interview/systemdesign";
import type { Scorecard } from "@/lib/interview/rounds";

/** Resolve the design scenario: the recruiter-authored one wins with NO model call;
 *  otherwise generate one (background flex-first tier). */
export async function resolveSystemDesignScenario(ctx: SystemDesignSetupContext): Promise<{ prompt: string }> {
  const recruiter = ctx.recruiterPrompt?.trim();
  if (recruiter) return normalizeSystemDesignSetup({}, { recruiterPrompt: ctx.recruiterPrompt });
  const { json } = await runInterviewJson(buildSystemDesignGenPrompt(ctx), 1500);
  return normalizeSystemDesignSetup(json, { recruiterPrompt: ctx.recruiterPrompt });
}

/** Score the design response. Interactive (candidate is waiting on submit) → standard tier. */
export async function scoreSystemDesign(ctx: SystemDesignScoreContext): Promise<Scorecard> {
  const { json } = await runInterviewJson(buildSystemDesignScorePrompt(ctx), 3000, { interactive: true });
  return normalizeSystemDesignScorecard(json, ctx.advanceThreshold);
}
