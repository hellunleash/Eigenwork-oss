import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { requireFirebaseUser } from "@/lib/auth-server";
import { applyCreditMutation, makeOpId } from "@/lib/credit-ledger";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * POST body: { jobId }
 *
 * Starts a new intake cycle for a job:
 *  1. Counts current submitted candidates linked to this job (= credits to restore).
 *  2. Restores that many credits to the job owner.
 *  3. Clears the cached matchResult so the results page recomputes.
 *  4. Does NOT delete candidates, role data, or generate a new intake link.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/new-intake";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const db = getAdminDb();
    const jobSnap = await db.collection("jds").doc(jobId).get();
    if (!jobSnap.exists) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const jobData = jobSnap.data();
    const userId = typeof jobData?.userId === "string" ? jobData.userId : null;
    if (!userId || userId !== auth.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const candSnap = await db
      .collection("candidates")
      .where("matchData.jobId", "==", jobId)
      .where("status", "==", "submitted")
      .get();
    const poolSize = candSnap.size;

    if (userId && poolSize > 0) {
      const opId = makeOpId({ source: "new-intake", jobId, userId, poolSize });
      await applyCreditMutation({
        userId,
        delta: poolSize,
        source: "new-intake",
        opId,
        metadata: { jobId, poolSize },
      });
    }

    await db.collection("jds").doc(jobId).update({
      matchResult: FieldValue.delete(),
      isClosed: false,
      newIntakeStartedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      creditsRestored: poolSize,
    });
  } catch (err) {
    log("error", "jd.new_intake_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Failed to start new intake" },
      { status: 500 },
    );
  }
}
