/**
 * Stage-4 take-home — the model + repo-signal wrappers (Phase 2). Split from the pure
 * takehome.ts so QA can exercise the builders/normalizers with no env/network. Reuses
 * the shared runInterviewJson (LLM) and lib/github-signals (deterministic code signal),
 * never forking either.
 */
import { getGithubSignal } from "@/lib/github-signals";
import { runInterviewJson } from "@/lib/interview/llm";
import {
  buildTakeHomeSetupPrompt,
  buildTakeHomeScorePrompt,
  normalizeTakeHomeSetup,
  normalizeTakeHomeScorecard,
  type RepoSignalStatus,
  type TakeHomeScoreContext,
  type TakeHomeSetupContext,
} from "@/lib/interview/takehome";
import type { Scorecard, ScreenQuestion } from "@/lib/interview/rounds";

/** Generate the assignment (if the recruiter didn't author one) + reactive probes.
 *  Background (invite-time) → flex-first tier. */
export async function generateTakeHomeSetup(ctx: TakeHomeSetupContext): Promise<{ prompt: string; probeQuestions: ScreenQuestion[] }> {
  const { json } = await runInterviewJson(buildTakeHomeSetupPrompt(ctx), 2500);
  return normalizeTakeHomeSetup(json, { recruiterPrompt: ctx.recruiterPrompt, probeCount: ctx.probeCount });
}

/** Score the take-home. Interactive (candidate is waiting on submit) → standard tier. */
export async function scoreTakeHome(ctx: TakeHomeScoreContext): Promise<Scorecard> {
  const { json } = await runInterviewJson(buildTakeHomeScorePrompt(ctx), 3000, { interactive: true });
  return normalizeTakeHomeScorecard(json, ctx.advanceThreshold);
}

/**
 * Read the DETERMINISTIC signal for the submitted repo (commit trajectory, authorship,
 * hardening — raw code never leaves lib/github-signals). getGithubSignal only ever hits
 * api.github.com for a parsed github.com owner/repo, so a non-github or junk URL simply
 * degrades to no_evidence (no SSRF surface).
 */
export async function getTakeHomeRepoSignal(url: string | null | undefined): Promise<{ status: RepoSignalStatus; summaryText: string | null }> {
  const sig = await getGithubSignal(url);
  return { status: sig.status, summaryText: sig.summaryText };
}
