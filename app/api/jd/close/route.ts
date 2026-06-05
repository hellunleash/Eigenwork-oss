import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/** POST body: { jobId }. Sets the job document isClosed to true. */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/close";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();
    const snap = await db.collection("jds").doc(jobId).get();
    const ownerOrg = snap.data()?.orgId;
    if (!ownerOrg || ownerOrg !== ctx.orgId) {
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
