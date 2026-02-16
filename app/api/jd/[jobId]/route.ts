import { NextResponse } from "next/server";
import { getAdminDb, adminStorageDelete } from "@/lib/firebase-admin";
import { getUserProfile } from "@/lib/user-credits";

type RouteContext = { params: Promise<{ jobId: string }> };

/** GET /api/jd/[jobId] — returns the job document for candidate intake autofill. Includes appliedCount, isClosed, and eigenCredits for link expiry/pause. */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();
    const snap = await db.collection("jds").doc(jobId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const data = snap.data();
    const isClosed = Boolean(data?.isClosed);
    const submissionCap = typeof data?.submissionCap === "number" ? data.submissionCap : 10;

    const candSnap = await db
      .collection("candidates")
      .where("matchData.jobId", "==", jobId)
      .where("status", "==", "submitted")
      .get();
    const appliedCount = candSnap.size;

    let eigenCredits = 0;
    const userId = typeof data?.userId === "string" ? data.userId : null;
    if (userId) {
      try {
        const profile = await getUserProfile(userId);
        eigenCredits = profile.eigenCredits;
      } catch {
        eigenCredits = 0;
      }
    }

    return NextResponse.json({
      ...data,
      id: snap.id,
      isClosed,
      submissionCap,
      appliedCount,
      eigenCredits,
    });
  } catch (err) {
    console.error("JD get error:", err);
    return NextResponse.json(
      { error: "Failed to load job", details: String(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/jd/[jobId] — deletes the job document, all linked candidates, and their resume files in storage. */
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();

    const candSnap = await db.collection("candidates").where("matchData.jobId", "==", jobId).get();

    for (const d of candSnap.docs) {
      const candidateId = d.id;
      try {
        await adminStorageDelete(`resumes/${candidateId}.pdf`);
      } catch (storageErr) {
        console.warn("[jd delete] Storage delete skipped for", candidateId, storageErr);
      }
      await db.collection("candidates").doc(candidateId).delete();
    }

    await db.collection("jds").doc(jobId).delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("JD delete error:", err);
    return NextResponse.json(
      { error: "Failed to delete pipeline", details: String(err) },
      { status: 500 }
    );
  }
}
