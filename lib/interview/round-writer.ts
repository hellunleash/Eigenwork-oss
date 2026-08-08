/**
 * Candidate round-tracking writer (Phase 2 — replaces the critic's "1b" idea of
 * editing lib/stage.ts). Deliberately SEPARATE from the prod stage machine: the
 * coarse funnel (screening→interviewing→offer…) stays in lib/stage.ts untouched;
 * finer-grained round records live under ROUND_ROOT on the candidate doc and are
 * written here. Zero edits to the prod stage machine = better isolation.
 *
 * Org-scoped ownership mirrors moveStage exactly (candidate → matchData.jobId →
 * jds.orgId === orgId; every non-owner/missing outcome collapses to 404).
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { ROUND_ROOT, type RoundKey } from "@/lib/interview/rounds";

export type RoundWriteResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Partial-safe dot-path update for ONE round's fields. Only defined fields are
 * written (Firestore rejects undefined); every path is addressed via ROUND_ROOT so
 * no caller hardcodes it, and it's never a bare `interviewRounds` key (which would
 * clobber sibling rounds). Pure — unit-tested by scripts/qa-interview-foundation.ts.
 */
export function buildRoundUpdate(round: RoundKey, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[`${ROUND_ROOT}.${round}.${key}`] = value;
  }
  return out;
}

/** Write/patch a candidate's round record, org-scoped. */
export async function writeRound(
  orgId: string,
  candidateId: string,
  round: RoundKey,
  patch: Record<string, unknown>
): Promise<RoundWriteResult> {
  const update = buildRoundUpdate(round, patch);
  if (Object.keys(update).length === 0) return { ok: true };

  const db = getAdminDb();
  const ref = db.collection("candidates").doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: "Not found" };

  const cand = snap.data() as Record<string, unknown>;
  const jobId =
    typeof (cand.matchData as { jobId?: unknown } | undefined)?.jobId === "string"
      ? (cand.matchData as { jobId: string }).jobId
      : null;
  if (!jobId) return { ok: false, status: 404, error: "Not found" };

  const jd = await db.collection("jds").doc(jobId).get();
  if (!jd.exists || (jd.data()?.orgId as string | undefined) !== orgId) {
    return { ok: false, status: 404, error: "Not found" };
  }

  await ref.update(update);
  return { ok: true };
}
