/**
 * Candidate stage transitions (ADR-010 Phase 0 extraction).
 *
 * Lifted from app/api/candidate/[id]/stage/route.ts so the platform route AND
 * the Slack agent ("move Maya to interview", "mark Abhay hired") drive ONE
 * stage machine. Behavior-preserving: same enumeration-resistant ownership chain
 * (candidate → matchData.jobId → jds.orgId === orgId, all non-owner outcomes
 * collapse to 404), same KPI timestamp stamping, same first-hire JD stamp.
 *
 * Firestore note: serverTimestamp() is NOT permitted inside an arrayUnion
 * element, so stageHistory entries timestamp with Date.now() (ms number).
 * Never writes undefined (Firestore rejects it) — fields are added conditionally.
 */
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

export const STAGES = ["screening", "interviewing", "offer", "hired", "rejected", "withdrawn"] as const;
export const OUTCOMES = ["cleared", "failed", "pending"] as const;
export type Stage = (typeof STAGES)[number];
export type Outcome = (typeof OUTCOMES)[number];

export type MoveStageResult =
  | { ok: true; stage: Stage; jobId: string }
  | { ok: false; status: number; error: string };

/**
 * Move a candidate through the hiring funnel and stamp the outcome timestamps the
 * KPI engine reads (time-to-fill, offer-acceptance, interview-clear). `userId` is
 * recorded as the actor in stageHistory (the Slack agent passes the mapped uid).
 */
export async function moveStage(
  orgId: string,
  userId: string,
  candidateId: string,
  stage: Stage,
  outcome?: Outcome
): Promise<MoveStageResult> {
  const db = getAdminDb();
  const ref = db.collection("candidates").doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: "Not found" };
  const candidate = snap.data() as Record<string, unknown>;

  // Ownership: candidate → its JD → org.
  const candidateJobId =
    typeof (candidate.matchData as { jobId?: unknown } | undefined)?.jobId === "string"
      ? ((candidate.matchData as { jobId?: string }).jobId as string)
      : null;
  if (!candidateJobId) return { ok: false, status: 404, error: "Not found" };
  const jdSnap = await db.collection("jds").doc(candidateJobId).get();
  if (!jdSnap.exists || (jdSnap.data()?.orgId as string | undefined) !== orgId) {
    return { ok: false, status: 404, error: "Not found" };
  }

  // Build the update — conditional spreads keep undefined out of Firestore.
  const now = FieldValue.serverTimestamp();
  const update: Record<string, unknown> = {
    stage,
    stageMovedAt: now,
    stageHistory: FieldValue.arrayUnion({ stage, at: Date.now(), by: userId }),
    ...(outcome != null && { interviewOutcome: outcome }),
  };
  if (stage === "interviewing") {
    update.selectedForInterview = true;
    if (outcome == null) update.interviewOutcome = "pending";
  }
  if (stage === "offer") update.offerExtendedAt = now;
  if (stage === "hired") {
    update.hiredAt = now;
    update.offerAcceptedAt = now;
    update.interviewOutcome = "cleared";
  }
  if (stage === "withdrawn") update.offerDeclinedAt = now;

  await ref.update(update);

  // Stamp the parent JD on the FIRST hire so time-to-fill (KPI #1) and
  // roles-filled (KPI #2) anchor on when the req actually closed. First-write-wins:
  // reuse the ownership snapshot and only stamp if hiredAt isn't already set.
  if (stage === "hired" && !jdSnap.data()?.hiredAt) {
    await db.collection("jds").doc(candidateJobId).update({
      hiredAt: now,
      hiredCandidateId: candidateId,
    });
  }

  return { ok: true, stage, jobId: candidateJobId };
}
