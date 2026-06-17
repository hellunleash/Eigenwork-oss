import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * PATCH /api/candidate/[id]/inflation-review  (KPI #4 — human-in-the-loop)
 *
 * The engine only ever *flags* a profile as possibly inflated (card.flag, from
 * the overlord verdict). KPI #4 ("Inflated profiles found") counts only the
 * ones a recruiter has CONFIRMED — so an auto-flag never silently inflates the
 * number. This route persists that recruiter decision on the candidate doc:
 *   inflationReview ∈ "confirmed" (agree it's inflated) | "cleared" (it's real)
 *   review === null  → clears the decision (back to un-reviewed)
 * The BigQuery KPI engine reads `inflationReview` and counts === "confirmed".
 *
 * Owner-only. Same enumeration-resistant ownership chain as the rest of
 * /api/candidate/[id]: requireOrgMember → candidate.matchData.jobId →
 * jds.orgId === ctx.orgId. All non-owner outcomes collapse to 404.
 *
 * Never writes undefined (Firestore rejects it); a null decision deletes the
 * field via FieldValue.delete().
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const REVIEWS = ["confirmed", "cleared"] as const;
type Review = (typeof REVIEWS)[number];

export async function PATCH(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]/inflation-review";
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as { review?: unknown };
    // null/undefined → clear the decision; otherwise must be a valid enum.
    const raw = body.review;
    const clearing = raw === null;
    const review = REVIEWS.includes(raw as Review) ? (raw as Review) : undefined;
    if (!clearing && review === undefined) {
      return NextResponse.json({ error: "invalid review" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("candidates").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const candidate = snap.data() as Record<string, unknown>;

    // Ownership: candidate → its JD → org.
    const candidateJobId =
      typeof (candidate.matchData as { jobId?: unknown } | undefined)?.jobId === "string"
        ? ((candidate.matchData as { jobId?: string }).jobId as string)
        : null;
    if (!candidateJobId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const jdSnap = await db.collection("jds").doc(candidateJobId).get();
    if (!jdSnap.exists || (jdSnap.data()?.orgId as string | undefined) !== ctx.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = clearing
      ? {
          inflationReview: FieldValue.delete(),
          inflationReviewedAt: FieldValue.delete(),
          inflationReviewedBy: FieldValue.delete(),
        }
      : {
          inflationReview: review,
          inflationReviewedAt: now,
          inflationReviewedBy: ctx.userId,
        };

    await ref.update(update);

    log("info", "candidate.inflation_reviewed", {
      requestId,
      route,
      candidateId: id,
      jobId: candidateJobId,
      review: clearing ? null : review,
      userId: ctx.userId,
    });
    return NextResponse.json({ success: true, review: clearing ? null : review });
  } catch (err) {
    log("error", "candidate.inflation_review_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
  }
}
