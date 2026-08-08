/**
 * Partial-safe persistence writer for `jds/{id}.interviewPlan` (Phase 2).
 *
 * Kept SEPARATE from lib/jd.ts on purpose: updateJd rewrites the whole doc body
 * via buildJdPayload, so routing interviewPlan through it would clobber sibling
 * config (critic blocker 1y). This writer uses Firestore dot-paths so a write of
 * one sub-key (e.g. a Slack "set the take-home") never wipes config authored from
 * another surface. Org-scoped ownership, matching updateJd/closeJd.
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { buildInterviewPlanUpdate, type InterviewPlan } from "@/lib/interview/plan";

export type UpdateInterviewPlanResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; error: string };

export async function updateInterviewPlan(
  orgId: string,
  jobId: string,
  partial: Partial<InterviewPlan>
): Promise<UpdateInterviewPlanResult> {
  const update = buildInterviewPlanUpdate(partial);
  if (Object.keys(update).length === 0) return { ok: true, jobId };

  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jobId).get();
  const ownerOrg = snap.data()?.orgId;
  if (!ownerOrg || ownerOrg !== orgId) return { ok: false, status: 403, error: "forbidden" };

  await db.collection("jds").doc(jobId).update(update);
  return { ok: true, jobId };
}
