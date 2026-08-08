/**
 * Stage-4 take-home orchestration (Phase 2). Same two-audience shape as the screen:
 *   - inviteToTakeHome — RECRUITER/agent, ORG-scoped: resolves the assignment
 *     (recruiter's, or generated) + reactive probes once, persists them, meters one
 *     screen (idempotent per candidate). Refuses if the founder disabled the round.
 *   - getTakeHomeForCandidate / submitTakeHome — CANDIDATE, TOKEN-scoped: invite-gated
 *     read (the assignment + probes; internal "what good looks like" is NEVER shown),
 *     and a consent-gated submit that reads the DETERMINISTIC repo signal + scores
 *     code-and-thinking coherence, then persists the scorecard.
 */
import { AEDT_NOTICE_VERSION } from "@/lib/interview/consent";
import { readRounds } from "@/lib/interview/rounds";
import { buildRoundUpdate } from "@/lib/interview/round-writer";
import { cardFrom } from "@/lib/interview/prompt-util";
import {
  buildTakeHomeSetupContext,
  resolveInterviewPlan,
  isSeniorTrack,
} from "@/lib/interview/context";
import { generateTakeHomeSetup, scoreTakeHome, getTakeHomeRepoSignal } from "@/lib/interview/takehome-run";
import {
  claimRoundForSubmit,
  coerceAnswers,
  isBlockedStage,
  loadByToken,
  meterCandidateOnce,
  resolveOwnedCandidate,
} from "@/lib/interview/candidate-access";

export type PublicProbe = { id: string; prompt: string };
export type TakeHomeAssignment = {
  prompt: string;
  timeboxHours: number | null;
  submissionFormat: string;
};

export type TakeHomeInviteResult = { ok: true; alreadyInvited?: boolean } | { ok: false; status: number; error: string };
export type TakeHomeFetchResult =
  | { ok: true; status: string; assignment: TakeHomeAssignment; probeQuestions: PublicProbe[] }
  | { ok: false; status: number; error: string };
export type TakeHomeSubmitResult = { ok: true } | { ok: false; status: number; error: string };

// --- Recruiter/agent: invite (resolve assignment + probes + meter), ORG-scoped ---

export async function inviteToTakeHome(orgId: string, candidateId: string): Promise<TakeHomeInviteResult> {
  const owned = await resolveOwnedCandidate(orgId, candidateId);
  if ("error" in owned) return { ok: false, status: owned.error.status, error: owned.error.message };
  const { ref, candidate, jd, jobId } = owned;
  if (isBlockedStage(candidate)) return { ok: false, status: 403, error: "candidate_not_active" };

  const senior = isSeniorTrack(candidate, jd);
  const plan = resolveInterviewPlan(jd, senior);
  if (!plan.takeHome.enabled) return { ok: false, status: 400, error: "round_disabled" };

  // Idempotent: assignment + probes already set → no regen, no recharge.
  const existing = readRounds(candidate).takeHome;
  if (existing?.prompt && (existing.probe?.questions?.length ?? 0) > 0) return { ok: true, alreadyInvited: true };

  // Meter ONCE per candidate (whole loop) — a candidate already charged at the screen
  // passes here free; only a never-charged candidate with no balance is blocked.
  const meter = await meterCandidateOnce({ orgId, jobId, candidateId });
  if (!meter.ok) return { ok: false, status: meter.status, error: meter.error };

  const setup = await generateTakeHomeSetup(buildTakeHomeSetupContext(candidate, jd, plan));
  await ref.update(
    buildRoundUpdate("takeHome", {
      status: "invited",
      prompt: setup.prompt,
      probe: { questions: setup.probeQuestions },
      invitedAt: Date.now(),
    })
  );
  return { ok: true };
}

// --- Candidate: fetch (invite-gated) + submit (consent-gated), TOKEN-scoped ------

export async function getTakeHomeForCandidate(candidateId: string, token: string): Promise<TakeHomeFetchResult> {
  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This assignment is no longer available." };

  const th = readRounds(loaded.candidate).takeHome;
  if (th?.status === "scored" || th?.status === "submitted") {
    return { ok: false, status: 409, error: "This assignment has already been submitted." };
  }
  const probes = th?.probe?.questions ?? [];
  if (!th?.prompt || probes.length === 0) {
    return { ok: false, status: 425, error: "not_ready" };
  }
  if (th.status === "invited") {
    await loaded.ref.update(buildRoundUpdate("takeHome", { status: "in_progress" }));
  }

  const senior = isSeniorTrack(loaded.candidate, loaded.jd);
  const plan = resolveInterviewPlan(loaded.jd, senior);
  return {
    ok: true,
    status: "in_progress",
    assignment: {
      prompt: th.prompt,
      timeboxHours: typeof plan.takeHome.timeboxHours === "number" ? plan.takeHome.timeboxHours : null,
      submissionFormat: plan.takeHome.submissionFormat ?? "repo",
    },
    probeQuestions: probes.map((q) => ({ id: q.id, prompt: q.prompt })),
  };
}

export async function submitTakeHome(
  candidateId: string,
  token: string,
  submission: { url?: unknown; walkthrough?: unknown; answers?: unknown },
  consent: boolean
): Promise<TakeHomeSubmitResult> {
  if (consent !== true) return { ok: false, status: 400, error: "consent_required" };

  const loaded = await loadByToken(candidateId, token);
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  if (isBlockedStage(loaded.candidate)) return { ok: false, status: 403, error: "This assignment is no longer available." };

  const th = readRounds(loaded.candidate).takeHome;
  const probes = th?.probe?.questions ?? [];
  if (!th?.prompt || probes.length === 0) {
    return { ok: false, status: 409, error: "This assignment hasn't been started yet." };
  }

  const url = typeof submission.url === "string" ? submission.url.trim().slice(0, 500) : "";
  const walkthrough = typeof submission.walkthrough === "string" ? submission.walkthrough.slice(0, 20000) : "";
  const probeAnswers = coerceAnswers(submission.answers, probes);

  // Atomically claim the submission — only the first concurrent POST proceeds to scoring.
  const claim = await claimRoundForSubmit(
    loaded.ref,
    "takeHome",
    (r) => {
      const rq = (r?.probe as { questions?: unknown[] } | undefined)?.questions;
      if (!r?.prompt || !Array.isArray(rq) || rq.length === 0) return { status: 409, error: "This assignment hasn't been started yet." };
      if (r?.status === "scored" || r?.status === "submitted") return { status: 409, error: "This assignment has already been submitted." };
      return null;
    },
    {
      submission: { format: "repo", url, walkthrough },
      probe: { questions: probes, answers: probeAnswers },
      consent: { acceptedAt: Date.now(), noticeVersion: AEDT_NOTICE_VERSION },
    }
  );
  if (!claim.ok) return claim;

  const senior = isSeniorTrack(loaded.candidate, loaded.jd);
  const plan = resolveInterviewPlan(loaded.jd, senior);
  const card = cardFrom(loaded.candidate.card);
  const repo = await getTakeHomeRepoSignal(url);
  const scorecard = await scoreTakeHome({
    roleTitle: typeof loaded.jd?.title === "string" ? loaded.jd.title : "this role",
    senior,
    assignmentPrompt: th.prompt,
    whatGoodLooksLike: typeof plan.takeHome.whatGoodLooksLike === "string" ? plan.takeHome.whatGoodLooksLike : null,
    repoStatus: repo.status,
    repoSummaryText: repo.summaryText,
    walkthrough,
    probeQuestions: probes,
    probeAnswers,
    ...(card ? { card } : {}),
    ...(plan.takeHome.advanceThreshold != null ? { advanceThreshold: plan.takeHome.advanceThreshold } : {}),
  });
  await loaded.ref.update(buildRoundUpdate("takeHome", { scorecard, status: "scored" }));
  return { ok: true };
}
