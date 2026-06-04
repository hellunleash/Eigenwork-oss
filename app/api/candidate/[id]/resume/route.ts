import { NextResponse } from "next/server";
import { getAdminDb, freshResumeUrl } from "@/lib/firebase-admin";
import { requireFirebaseUser } from "@/lib/auth-server";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/candidate/[id]/resume
 *
 * Returns { url: <fresh 1-hour signed Storage URL> } for the candidate's
 * resume PDF. Auth: Bearer Firebase ID token AND owner check
 * (candidate.matchData.jobId -> jds.userId == requester.uid).
 *
 * Why this exists: any signed URL we mint expires in 1 hour. Pages that
 * embed a URL in their JSON response work fine for ~1 hour from page load,
 * but if the employer keeps a tab open longer and then clicks Download,
 * the embedded URL is stale. This endpoint mints a fresh URL on every
 * click so the download button always works without re-exposing the
 * resume to ID-guessing attackers. See bugs-fixed/storage.txt.
 *
 * Failure modes are deliberately collapsed to 404 (matching the parent
 * /api/candidate/[id] route's enumeration-resistant behavior).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]/resume";

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const db = getAdminDb();
    const snap = await db.collection("candidates").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const candidate = snap.data() as Record<string, unknown> | undefined;
    if (!candidate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const matchData = (candidate.matchData as { jobId?: unknown } | undefined) ?? undefined;
    const candidateJobId =
      typeof matchData?.jobId === "string" && matchData.jobId.length > 0
        ? matchData.jobId
        : null;
    if (!candidateJobId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const jdSnap = await db.collection("jds").doc(candidateJobId).get();
    const jdOwner = jdSnap.exists ? (jdSnap.data()?.userId as string | undefined) : undefined;
    if (!jdOwner || jdOwner !== auth.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const resumePath = typeof candidate.resumePath === "string" ? candidate.resumePath : null;
    const url = await freshResumeUrl(resumePath);
    if (!url) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    log("error", "candidate.resume_url_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load resume" }, { status: 500 });
  }
}
