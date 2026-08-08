/**
 * Stage-3 screen orchestration (Phase 2).
 *
 * Two audiences, two auth models:
 *   - inviteToScreen — RECRUITER/agent, ORG-scoped. Generates the questions once
 *     (background flex tier), persists them, and METERS one screen against the org's
 *     entitlement (canEvaluate → debitRound, idempotent per candidate). This is the
 *     generate-on-invite step: the candidate never waits for generation.
 *   - getScreenForCandidate / submitScreen — CANDIDATE, TOKEN-scoped (no login; the
 *     accessToken proves it's their own doc). Read-only fetch (invite-gated: a screen
 *     that hasn't been invited returns "not ready", so a raw link can't self-start),
 *     and a consent-gated submit that scores (standard tier) + persists the scorecard.
 *
 * Shared load/ownership/metering/coercion live in candidate-access.ts (reuse-never-fork).
 */
import { AEDT_NOTICE_VERSION } from "@/lib/interview/consent";
import { readRounds, type ScreenQuestion } from "@/lib/interview/rounds";
import { buildRoundUpdate } from "@/lib/interview/round-writer";
import { cardFrom } from "@/lib/interview/prompt-util";
import { buildScreenGenContext, resolveInterviewPlan, isSeniorTrack } from "@/lib/interview/context";
import { generateScreenQuestions, scoreScreen } from "@/lib/interview/screen-run";
import {
  claimRoundForSubmit,
  coerceAnswers,
  isBlockedStage,
  loadByToken,
  meterCandidateOnce,
  resolveOwnedCandidate,
} from "@/lib/interview/candidate-access";

export type PublicQuestion = { id: string; kind: "code" | "probe"; prompt: string };

export type InviteResult = { ok: true; alreadyInvited?: boolean } | { ok: false; status: number; error: string };
export type ScreenFetchResult =
  | { ok: true; status: string; questions: PublicQuestion[] }
  | { ok: false; status: number; error: string };
export type ScreenSubmitResult = { ok: true } | { ok: false; status: number; error: string };

// --- Recruiter/agent: invite (generate + meter), ORG-scoped -------------------

/**
 * Invite a candidate to the stage-3 screen: generate + persist the questions and
 * spend one screen against the org. Idempotent — re-inviting a candidate whose
 * questions already exist neither regenerates nor re-charges.
 */
export async function inviteToScreen(orgId: string, candidateId: string): Promise<InviteResult> {
  const owned = await resolveOwnedCandidate(orgId, candidateId);
  if ("error" in owned) return { ok: false, status: owned.error.status, error: owned.error.message };
  const { ref, candidate, jd, jobId } = owned;
  if (isBlockedStage(candidate)) return { ok: false, status: 403, error: "candidate_not_active" };

  // Idempotent: already generated → no regen, no recharge.
  const existing = readRounds(candidate).screen?.questions;
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, alreadyInvited: true };

  // Meter ONCE per candidate (whole loop). Gate + charge before spending the model.
  const meter = await meterCandidateOnce({ orgId, jobId, candidateId });
  if (!meter.ok) return { ok: false, status: meter.status, error: meter.error };

  const senior = isSeniorTrack(candidate, jd);
  const plan = resolveInterviewPlan(jd, senior);
  const questions = await generateScreenQuestions(buildScreenGenContext(candidate, jd, plan));
  if (questions.length === 0) {
    // Generation produced nothing usable — do NOT persist an empty screen (the candidate
    // would be stuck at 425 with a credit spent). The credit is idempotent per candidate,
    // so a re-invite regenerates for free.
    return { ok: false, status: 502, error: "generation_failed" };
  }
  await ref.update(buildRoundUpdate("screen", { status: "invited", questions, invitedAt: Date.now() }));
  return { ok: true };
}

// --- Candidate: fetch (invite-gated) + submit (consent-gated), TOKEN-scoped ----

/**
 * Fetch the candidate's screen questions (read-only). Invite-gated: if the screen
 * hasn't been invited (no persisted questions) it returns "not ready" rather than
 * generating — a raw link can't self-start a screen, and there's never a generation
 * wait on the candidate's first open.
 */
export async function getScreenForCandidate(candidateId: string, token: string): Promise<ScreenFetchResult> {
  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This screen is no longer available." };

  const screen = readRounds(loaded.candidate).screen;
  if (screen?.status === "scored" || screen?.status === "submitted") {
    return { ok: false, status: 409, error: "This screen has already been submitted." };
  }
  const questions = screen?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, status: 425, error: "not_ready" };
  }
  if (screen?.status === "invited") {
    await loaded.ref.update(buildRoundUpdate("screen", { status: "in_progress" }));
  }
  return { ok: true, status: "in_progress", questions: questions.map(toPublic) };
}

/**
 * Persist answers, then score (standard tier) + persist the scorecard. Consent-gated
 * (records the AEDT notice version), eligibility + no-resubmit gated. The scorecard is
 * recruiter-facing and never returned to the candidate.
 */
export async function submitScreen(
  candidateId: string,
  token: string,
  rawAnswers: unknown,
  consent: boolean
): Promise<ScreenSubmitResult> {
  if (consent !== true) return { ok: false, status: 400, error: "consent_required" };

  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This screen is no longer available." };

  const questions = readRounds(loaded.candidate).screen?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, status: 409, error: "This screen hasn't been started yet." };
  }
  const answers = coerceAnswers(rawAnswers, questions);
  // Atomically claim the submission — only the first of any concurrent POSTs proceeds
  // to scoring (prevents N parallel billable scoring calls + a nondeterministic scorecard).
  const claim = await claimRoundForSubmit(
    loaded.ref,
    "screen",
    (r) => {
      if (!Array.isArray(r?.questions) || (r.questions as unknown[]).length === 0) return { status: 409, error: "This screen hasn't been started yet." };
      if (r?.status === "scored" || r?.status === "submitted") return { status: 409, error: "This screen has already been submitted." };
      return null;
    },
    { answers, consent: { acceptedAt: Date.now(), noticeVersion: AEDT_NOTICE_VERSION } }
  );
  if (!claim.ok) return claim;

  const senior = isSeniorTrack(loaded.candidate, loaded.jd);
  const plan = resolveInterviewPlan(loaded.jd, senior);
  const card = cardFrom(loaded.candidate.card);
  const scorecard = await scoreScreen({
    roleTitle: typeof loaded.jd?.title === "string" ? loaded.jd.title : "this role",
    senior,
    questions,
    answers,
    ...(card ? { card } : {}),
    ...(plan.screen.advanceThreshold != null ? { advanceThreshold: plan.screen.advanceThreshold } : {}),
  });
  await loaded.ref.update(buildRoundUpdate("screen", { scorecard, status: "scored" }));
  return { ok: true };
}

function toPublic(q: ScreenQuestion): PublicQuestion {
  return { id: q.id, kind: q.kind, prompt: q.prompt };
}
