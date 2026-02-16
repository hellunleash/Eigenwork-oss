import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/** POST body: { jobId }. Sets the job document isClosed to true. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();
    await db.collection("jds").doc(jobId).update({ isClosed: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("JD close error:", err);
    return NextResponse.json(
      { error: "Failed to close pipeline", details: String(err) },
      { status: 500 }
    );
  }
}
