import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireFirebaseUser } from "@/lib/auth-server";
import { getRequestId, log } from "@/lib/server-logger";

/** POST body: { jobId }. Sets the job document isClosed to true. */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/close";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();
    const snap = await db.collection("jds").doc(jobId).get();
    const owner = snap.data()?.userId;
    if (!owner || owner !== auth.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await db.collection("jds").doc(jobId).update({ isClosed: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    log("error", "jd.close_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Failed to close pipeline" },
      { status: 500 }
    );
  }
}
