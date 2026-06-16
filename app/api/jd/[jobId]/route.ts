import { NextResponse } from "next/server";
import { getAdminDb, adminStorageDelete } from "@/lib/firebase-admin";
import { getEntitlementSummary } from "@/lib/entitlements";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

type RouteContext = { params: Promise<{ jobId: string }> };

/**
 * GET /api/jd/[jobId] — PUBLIC.
 *
 * Used by the candidate intake page to autofill the job title/stack/location
 * fields and to gate submission when isClosed or the owning org has no
 * screens left (screensRemaining === 0 pauses the intake link).
 *
 * IMPORTANT: this endpoint is reachable by anyone who has the intake link
 * (which is shared publicly on X/LinkedIn/email blasts). Responses MUST be
 * a strict whitelist of fields safe to show on a public intake form. In
 * particular this MUST NOT return:
 *   - userId (owner identity)
 *   - matchResult / matchResult.top20 (the employer's ranked candidate
 *     shortlist, including names, emails, phones, resume URLs)
 *   - any other internal field added to the JD doc in the future
 *
 * Historical: prior to this hardening (see bugs-fixed/data-exposure.txt,
 * 2026-06-03) this route used a blacklist that filtered out only `userId`,
 * which leaked matchResult to anyone with the intake link.
 */
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
    const data = (snap.data() ?? {}) as Record<string, unknown>;

    const isClosed = Boolean(data.isClosed);
    const submissionCap = typeof data.submissionCap === "number" ? data.submissionCap : 10;

    const candSnap = await db
      .collection("candidates")
      .where("matchData.jobId", "==", jobId)
      .where("status", "==", "submitted")
      .get();
    const appliedCount = candSnap.size;

    // Read the canonical org-scoped screen balance (ADR-002): pass bucket
    // remaining + wallet. This is the same source the dashboard banner and the
    // canEvaluate gate use, so the intake-page pause and the actual server gate
    // stay in agreement.
    let screensRemaining = 0;
    const ownerOrgId = typeof data.orgId === "string" ? data.orgId : null;
    if (ownerOrgId) {
      try {
        const summary = await getEntitlementSummary(ownerOrgId);
        screensRemaining = summary.screensRemaining;
      } catch {
        screensRemaining = 0;
      }
    }

    // EXPLICIT WHITELIST. Add a new field here only after confirming it's safe
    // to expose to an unauthenticated intake-page viewer.
    const publicView = {
      id: snap.id,
      title: typeof data.title === "string" ? data.title : "",
      seniority: typeof data.seniority === "string" ? data.seniority : "",
      role_category: typeof data.role_category === "string" ? data.role_category : "",
      tech_stack: Array.isArray(data.tech_stack) ? data.tech_stack : [],
      location_type: typeof data.location_type === "string" ? data.location_type : "",
      yoe_required: typeof data.yoe_required === "string" ? data.yoe_required : "",
      employment_type: typeof data.employment_type === "string" ? data.employment_type : "",
      work_auth_requirement:
        data.work_auth_requirement && typeof data.work_auth_requirement === "object"
          ? data.work_auth_requirement
          : null,
      role_fit:
        data.role_fit && typeof data.role_fit === "object"
          ? data.role_fit
          : null,
      isClosed,
      submissionCap,
      appliedCount,
      screensRemaining,
    };

    return NextResponse.json(publicView);
  } catch (err) {
    log("error", "jd.get_failed", { route: "/api/jd/[jobId]" }, err);
    return NextResponse.json({ error: "Failed to load job" }, { status: 500 });
  }
}

/** DELETE /api/jd/[jobId] — deletes the job document, all linked candidates, and their resume files in storage. */
export async function DELETE(_req: Request, context: RouteContext) {
  const requestId = getRequestId(_req.headers);
  const route = "/api/jd/[jobId]";
  try {
    const ctx = await requireOrgMember(_req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { jobId } = await context.params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const db = getAdminDb();
    const jobSnap = await db.collection("jds").doc(jobId).get();
    const ownerOrg = jobSnap.data()?.orgId;
    if (!ownerOrg || ownerOrg !== ctx.orgId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const candSnap = await db.collection("candidates").where("matchData.jobId", "==", jobId).get();

    // Parallelize the cascade with bounded concurrency. Sequential deletion of
    // ~500 candidates would exceed Vercel Hobby's 60s function cap; 25 in
    // parallel drains 500 candidates in ~10-12s. For pipelines larger than
    // that, the frontend prefers the Cloud Run /jd/cascade-delete endpoint
    // (no Vercel cap). This Vercel route remains the rollback path.
    const PARALLELISM = 25;
    const docs = candSnap.docs;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= docs.length) return;
        const candidateId = docs[i].id;
        try {
          await adminStorageDelete(`resumes/${candidateId}.pdf`);
        } catch (storageErr) {
          console.warn("[jd delete] Storage delete skipped for", candidateId, storageErr);
        }
        try {
          await db.collection("candidates").doc(candidateId).delete();
        } catch (firestoreErr) {
          console.warn("[jd delete] Firestore delete failed for", candidateId, firestoreErr);
        }
      }
    };
    const lanes = Math.max(1, Math.min(PARALLELISM, docs.length));
    await Promise.all(Array.from({ length: lanes }, () => worker()));

    await db.collection("jds").doc(jobId).delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    log("error", "jd.delete_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Failed to delete pipeline" },
      { status: 500 }
    );
  }
}
