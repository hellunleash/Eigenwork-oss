/**
 * Shared candidate-access helpers for interview-round orchestration (Phase 2). ONE
 * home for the token-scoped load, the org-scoped ownership resolve, per-round metering,
 * and answer coercion so the screen / take-home / system-design orchestrators don't
 * each copy them (reuse-never-fork — the rule Arhaan has been burned by 3×).
 *
 * Ownership mirrors moveStage/writeRound exactly: candidate → matchData.jobId →
 * jds.orgId === orgId; every non-owner/missing outcome collapses to 404. The eligibility
 * gate (canEvaluate) is called directly by each orchestrator BEFORE it spends the model;
 * debitRound performs the idempotent charge AFTER the work persists.
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { consumeInterviewCredit } from "@/lib/interview/interview-credits";
import { tokensMatch } from "@/lib/interview/token";
import { readRounds, type RoundKey, type ScreenAnswer, type ScreenQuestion } from "@/lib/interview/rounds";
import { buildRoundUpdate } from "@/lib/interview/round-writer";

export type Doc = Record<string, unknown>;

export function jobIdOf(candidate: Doc): string | null {
  const j = (candidate.matchData as { jobId?: unknown } | undefined)?.jobId;
  return typeof j === "string" && j ? j : null;
}

/** A rejected/withdrawn candidate can no longer act on any round. */
export function isBlockedStage(candidate: Doc): boolean {
  const stage = typeof candidate.stage === "string" ? candidate.stage : "";
  return stage === "rejected" || stage === "withdrawn";
}

export type OwnedCandidate = {
  ref: FirebaseFirestore.DocumentReference;
  candidate: Doc;
  jd: Doc;
  jobId: string;
};

/** Org-scoped load for a recruiter/agent action (invite). 404 on any non-owner/missing. */
export async function resolveOwnedCandidate(
  orgId: string,
  candidateId: string
): Promise<OwnedCandidate | { error: { status: number; message: string } }> {
  const db = getAdminDb();
  const ref = db.collection("candidates").doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return { error: { status: 404, message: "Not found" } };
  const candidate = snap.data() as Doc;
  const jobId = jobIdOf(candidate);
  if (!jobId) return { error: { status: 404, message: "Not found" } };
  const jdSnap = await db.collection("jds").doc(jobId).get();
  const jd = jdSnap.exists ? (jdSnap.data() as Doc) : null;
  if (!jd || (jd.orgId as string | undefined) !== orgId) return { error: { status: 404, message: "Not found" } };
  return { ref, candidate, jd, jobId };
}

export type LoadedByToken = { ref: FirebaseFirestore.DocumentReference; candidate: Doc; jd: Doc | null };

/** Token-scoped load for a candidate action (no login). Null on any mismatch. */
export async function loadByToken(candidateId: string, token: string): Promise<LoadedByToken | null> {
  const db = getAdminDb();
  const ref = db.collection("candidates").doc(candidateId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const candidate = snap.data() as Doc;
  const stored = typeof candidate.accessToken === "string" ? candidate.accessToken : "";
  if (!tokensMatch(token, stored)) return null;
  const jobId = jobIdOf(candidate);
  const jd = jobId ? ((await db.collection("jds").doc(jobId).get()).data() as Doc | undefined) ?? null : null;
  return { ref, candidate, jd };
}

/**
 * Meter ONE INTERVIEW CREDIT per CANDIDATE for the whole loop (pricing: $/candidate).
 * Debits the SEPARATE interview-credits balance — NEVER the screen wallet — so interview
 * usage and résumé-screening usage are fully independent. Idempotent per candidate: the
 * FIRST round invited charges once, every later round is a `duplicate` no-op, so a
 * candidate already paid for passes all remaining rounds even at 0 balance. Call BEFORE
 * spending the model (a failed generation leaves the charge; a retry regenerates free).
 */
export async function meterCandidateOnce(args: { orgId: string; jobId: string; candidateId: string }): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const debit = await consumeInterviewCredit({
    orgId: args.orgId,
    candidateId: args.candidateId,
    metadata: { jobId: args.jobId },
  });
  if (debit.applied) return { ok: true }; // first round → charged once
  if (debit.reason === "duplicate") return { ok: true }; // later round → already paid, allow
  return { ok: false, status: 402, error: "no_credits" };
}

/** Coerce raw client answers to the known question ids: dedup (first-wins), bound each
 *  to 8000 chars, and cap the count at the number of questions — so a client can't push
 *  a huge/duplicated array into a Firestore write. */
export function coerceAnswers(raw: unknown, questions: ScreenQuestion[]): ScreenAnswer[] {
  const ids = new Set(questions.map((q) => q.id));
  const seen = new Set<string>();
  const arr = Array.isArray(raw) ? raw : [];
  const out: ScreenAnswer[] = [];
  for (const a of arr) {
    if (out.length >= questions.length) break;
    if (!a || typeof a !== "object") continue;
    const id = (a as { id?: unknown }).id;
    const text = (a as { text?: unknown }).text;
    if (typeof id === "string" && ids.has(id) && !seen.has(id) && typeof text === "string") {
      seen.add(id);
      out.push({ id, text: text.slice(0, 8000) });
    }
  }
  return out;
}

/**
 * Atomically CLAIM a round for submission (fixes the submit TOCTOU: N concurrent POSTs
 * would each pass a plain read-then-write status check and fire N billable scoring
 * calls). Inside a transaction it re-reads the round, runs `validate` (reject if not
 * ready / already submitted/scored), and if OK flips status→submitted with the caller's
 * patch. Only the FIRST caller wins; losers get the rejection (409) and never score.
 */
export async function claimRoundForSubmit(
  ref: FirebaseFirestore.DocumentReference,
  round: RoundKey,
  validate: (r: Record<string, unknown> | undefined) => { status: number; error: string } | null,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = readRounds(snap.data())[round] as Record<string, unknown> | undefined;
    const rejection = validate(current);
    if (rejection) return { ok: false as const, status: rejection.status, error: rejection.error };
    tx.update(ref, buildRoundUpdate(round, { ...patch, status: "submitted", submittedAt: Date.now() }));
    return { ok: true as const };
  });
}
