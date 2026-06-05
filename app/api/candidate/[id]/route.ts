import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminDb, freshResumeUrl, adminStorageDelete } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/candidate/[id]
 *
 * Two authorized modes — the endpoint is closed to ID-guessing attackers:
 *
 *   1. Owner mode (employer dashboard view).
 *      Requires a Bearer Firebase ID token whose uid matches the userId on
 *      the JD this candidate applied to (matchData.jobId -> jds.userId).
 *      Returns the full candidate document with a freshly-generated 1-hour
 *      signed resume URL.
 *
 *   2. Self mode (candidate's own submission-status page).
 *      Requires ?t=<accessToken> matching the per-candidate token written at
 *      submission time. Returns ONLY { exists, status, evaluatedAt } — no
 *      name, email, phone, resume URL, or evaluation breakdown. The candidate
 *      dashboard intentionally needs nothing more.
 *
 * Any other request gets 404 (we don't distinguish "not found" from "not
 * authorized" so attackers can't probe for existence).
 *
 * Historical: prior to this hardening (see bugs-fixed/security.txt and
 * bugs-fixed/data-exposure.txt, 2026-06-03) this route returned the entire
 * candidate document — including resume URL, email, phone, full ETI
 * breakdown — to anyone who guessed an ID.
 */

type RouteContext = { params: Promise<{ id: string }> };

function tokensMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]";

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getAdminDb();
    const snap = await db.collection("candidates").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const candidate = snap.data() as Record<string, unknown> | undefined;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // --- Mode 1: owner (Firebase auth on the JD the candidate applied to) -----
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authHeader) {
      const ctx = await requireOrgMember(req.headers);
      if (!ctx.ok) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }

      const matchData = (candidate.matchData as { jobId?: unknown } | undefined) ?? undefined;
      const jobIdRaw = matchData?.jobId;
      const candidateJobId = typeof jobIdRaw === "string" && jobIdRaw.length > 0 ? jobIdRaw : null;

      if (!candidateJobId) {
        // Candidate not bound to a JD — no owner exists to authorize the view.
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }

      const jdSnap = await db.collection("jds").doc(candidateJobId).get();
      const jdOwnerOrg = jdSnap.exists ? (jdSnap.data()?.orgId as string | undefined) : undefined;
      if (!jdOwnerOrg || jdOwnerOrg !== ctx.orgId) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }

      // Owner view: full document. Always regenerate the resume URL fresh
      // rather than returning whatever stale long-lived URL may still be
      // persisted on legacy candidate docs (see bugs-fixed/storage.txt).
      const resumePath = typeof candidate.resumePath === "string" ? candidate.resumePath : null;
      const freshUrl = await freshResumeUrl(resumePath);

      // Strip the access token from owner responses — it's a self-service
      // credential for the candidate, not data the employer needs.
      const { accessToken: _omit, resumeUrl: _omitUrl, ...rest } = candidate as Record<string, unknown> & {
        accessToken?: unknown;
        resumeUrl?: unknown;
      };
      void _omit;
      void _omitUrl;

      return NextResponse.json({
        id: snap.id,
        ...rest,
        resumeUrl: freshUrl,
      });
    }

    // --- Mode 2: self (per-candidate access token) ----------------------------
    const url = new URL(req.url);
    const suppliedToken = url.searchParams.get("t") ?? "";
    const storedToken = typeof candidate.accessToken === "string" ? candidate.accessToken : "";

    if (suppliedToken && storedToken && tokensMatch(suppliedToken, storedToken)) {
      // Safe subset only. The dashboard renders "Your application has been
      // submitted." — it needs nothing beyond the existence + status signal.
      const status = typeof candidate.status === "string" ? candidate.status : "processing";
      return NextResponse.json({
        id: snap.id,
        exists: true,
        status,
      });
    }

    // No auth and no valid token -> indistinguishable from not-found so an
    // attacker can't enumerate or confirm candidate IDs.
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  } catch (err) {
    log("error", "candidate.get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load candidate" }, { status: 500 });
  }
}

/**
 * DELETE /api/candidate/[id]
 *
 * Owner-only deletion. Cascades to the resume PDF in Storage so a single
 * candidate can be removed for GDPR-style "right to deletion" requests, or
 * when the employer wants to clean up a specific applicant without nuking
 * the whole pipeline.
 *
 * Auth shape matches GET: Bearer Firebase ID token whose uid matches the JD
 * owner (candidate.matchData.jobId -> jds.userId). Self-mode (accessToken)
 * is NOT accepted here — candidates can't delete their own application via
 * this route (a separate "request deletion" flow would be the right shape
 * for that, including identity reconfirmation and audit logging; out of
 * scope for now). All non-owner outcomes collapse to 404 to match the
 * enumeration-resistant GET behavior.
 */
export async function DELETE(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]";

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const db = getAdminDb();
    const candidateRef = db.collection("candidates").doc(id);
    const snap = await candidateRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    const candidate = snap.data() as Record<string, unknown> | undefined;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const matchData = (candidate.matchData as { jobId?: unknown } | undefined) ?? undefined;
    const candidateJobId =
      typeof matchData?.jobId === "string" && matchData.jobId.length > 0
        ? matchData.jobId
        : null;
    if (!candidateJobId) {
      // No JD ownership chain -> no one is authorized to delete via this path.
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const jdSnap = await db.collection("jds").doc(candidateJobId).get();
    const jdOwnerOrg = jdSnap.exists ? (jdSnap.data()?.orgId as string | undefined) : undefined;
    if (!jdOwnerOrg || jdOwnerOrg !== ctx.orgId) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Best-effort resume PDF delete BEFORE the doc delete. If Storage fails
    // we still proceed with the doc delete and log — orphaned objects are
    // an operational concern, not a correctness one, and the alternative
    // (refusing to delete the doc when Storage hiccups) is worse UX.
    const resumePath = typeof candidate.resumePath === "string" ? candidate.resumePath : null;
    if (resumePath) {
      try {
        await adminStorageDelete(resumePath);
      } catch (storageErr) {
        log(
          "warn",
          "candidate.delete_storage_failed",
          { requestId, route, candidateId: id, resumePath },
          storageErr
        );
      }
    }

    await candidateRef.delete();

    log("info", "candidate.deleted", {
      requestId,
      route,
      candidateId: id,
      jobId: candidateJobId,
      userId: ctx.userId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    log("error", "candidate.delete_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to delete candidate" }, { status: 500 });
  }
}
