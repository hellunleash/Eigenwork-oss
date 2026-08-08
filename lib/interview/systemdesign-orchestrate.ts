/**
 * Stage-4 system-design orchestration (Phase 2). The senior maturity signal — a
 * free-text design response, no GitHub. Same two-audience shape as the screen:
 *   - inviteToSystemDesign — RECRUITER/agent, ORG-scoped: resolves the scenario
 *     (recruiter's with NO model call, else generated), persists it, meters one screen
 *     (idempotent). Refuses if the founder disabled the round.
 *   - getSystemDesignForCandidate / submitSystemDesign — CANDIDATE, TOKEN-scoped:
 *     invite-gated read of the scenario, consent-gated submit that scores the response.
 */
import { AEDT_NOTICE_VERSION } from "@/lib/interview/consent";
import { readRounds } from "@/lib/interview/rounds";
import { buildRoundUpdate } from "@/lib/interview/round-writer";
import { cardFrom } from "@/lib/interview/prompt-util";
import { buildSystemDesignSetupContext, resolveInterviewPlan, isSeniorTrack } from "@/lib/interview/context";
import { resolveSystemDesignScenario, scoreSystemDesign } from "@/lib/interview/systemdesign-run";
import { claimRoundForSubmit, isBlockedStage, loadByToken, meterCandidateOnce, resolveOwnedCandidate } from "@/lib/interview/candidate-access";

export type SystemDesignInviteResult = { ok: true; alreadyInvited?: boolean } | { ok: false; status: number; error: string };
export type SystemDesignFetchResult =
  | { ok: true; status: string; prompt: string }
  | { ok: false; status: number; error: string };
export type SystemDesignSubmitResult = { ok: true } | { ok: false; status: number; error: string };

// --- Recruiter/agent: invite (resolve scenario + meter), ORG-scoped -------------

export async function inviteToSystemDesign(orgId: string, candidateId: string): Promise<SystemDesignInviteResult> {
  const owned = await resolveOwnedCandidate(orgId, candidateId);
  if ("error" in owned) return { ok: false, status: owned.error.status, error: owned.error.message };
  const { ref, candidate, jd, jobId } = owned;
  if (isBlockedStage(candidate)) return { ok: false, status: 403, error: "candidate_not_active" };

  const senior = isSeniorTrack(candidate, jd);
  const plan = resolveInterviewPlan(jd, senior);
  if (!plan.systemDesign.enabled) return { ok: false, status: 400, error: "round_disabled" };

  const existing = readRounds(candidate).systemDesign;
  if (existing?.prompt) return { ok: true, alreadyInvited: true };

  // Meter ONCE per candidate (whole loop) — free if already charged at an earlier round.
  const meter = await meterCandidateOnce({ orgId, jobId, candidateId });
  if (!meter.ok) return { ok: false, status: meter.status, error: meter.error };

  const { prompt } = await resolveSystemDesignScenario(buildSystemDesignSetupContext(candidate, jd, plan));
  await ref.update(buildRoundUpdate("systemDesign", { status: "invited", prompt, invitedAt: Date.now() }));
  return { ok: true };
}

// --- Candidate: fetch (invite-gated) + submit (consent-gated), TOKEN-scoped ------

export async function getSystemDesignForCandidate(candidateId: string, token: string): Promise<SystemDesignFetchResult> {
  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This exercise is no longer available." };

  const sd = readRounds(loaded.candidate).systemDesign;
  if (sd?.status === "scored" || sd?.status === "submitted") {
    return { ok: false, status: 409, error: "This exercise has already been submitted." };
  }
  if (!sd?.prompt) return { ok: false, status: 425, error: "not_ready" };
  if (sd.status === "invited") {
    await loaded.ref.update(buildRoundUpdate("systemDesign", { status: "in_progress" }));
  }
  return { ok: true, status: "in_progress", prompt: sd.prompt };
}

export async function submitSystemDesign(
  candidateId: string,
  token: string,
  rawResponse: unknown,
  consent: boolean
): Promise<SystemDesignSubmitResult> {
  if (consent !== true) return { ok: false, status: 400, error: "consent_required" };

  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This exercise is no longer available." };

  const sd = readRounds(loaded.candidate).systemDesign;
  if (!sd?.prompt) return { ok: false, status: 409, error: "This exercise hasn't been started yet." };
  const response = typeof rawResponse === "string" ? rawResponse.slice(0, 30000) : "";

  // Atomically claim the submission — only the first concurrent POST proceeds to scoring.
  const claim = await claimRoundForSubmit(
    loaded.ref,
    "systemDesign",
    (r) => {
      if (!r?.prompt) return { status: 409, error: "This exercise hasn't been started yet." };
      if (r?.status === "scored" || r?.status === "submitted") return { status: 409, error: "This exercise has already been submitted." };
      return null;
    },
    { response, consent: { acceptedAt: Date.now(), noticeVersion: AEDT_NOTICE_VERSION } }
  );
  if (!claim.ok) return claim;

  const senior = isSeniorTrack(loaded.candidate, loaded.jd);
  const plan = resolveInterviewPlan(loaded.jd, senior);
  const card = cardFrom(loaded.candidate.card);
  const scorecard = await scoreSystemDesign({
    roleTitle: typeof loaded.jd?.title === "string" ? loaded.jd.title : "this role",
    senior,
    prompt: sd.prompt,
    rubricEmphasis: typeof plan.systemDesign.rubricEmphasis === "string" ? plan.systemDesign.rubricEmphasis : null,
    response,
    ...(card ? { card } : {}),
    ...(plan.systemDesign.advanceThreshold != null ? { advanceThreshold: plan.systemDesign.advanceThreshold } : {}),
  });
  await loaded.ref.update(buildRoundUpdate("systemDesign", { scorecard, status: "scored" }));
  return { ok: true };
}
