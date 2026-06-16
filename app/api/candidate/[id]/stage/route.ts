import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * PATCH /api/candidate/[id]/stage  (ADR-009 — stage transitions)
 *
 * Owner-only write that moves a candidate through the hiring funnel and stamps
 * the outcome timestamps the KPI engine reads (time-to-fill, offer-acceptance,
 * shortlist-quality interview-clear). Same enumeration-resistant ownership chain
 * as the rest of /api/candidate/[id]: requireOrgMember → candidate.matchData.jobId
 * → jds.orgId === ctx.orgId. All non-owner outcomes collapse to 404.
 *
 * Body: { stage, interviewOutcome? }
 *   stage ∈ screening | interviewing | offer | hired | rejected | withdrawn
 *   interviewOutcome ∈ cleared | failed | pending
 *
 * Firestore note: serverTimestamp() is NOT permitted inside an arrayUnion
 * element, so stageHistory entries timestamp with Date.now() (ms number).
 * Never writes undefined (Firestore rejects it) — fields are added conditionally.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const STAGES = ["screening", "interviewing", "offer", "hired", "rejected", "withdrawn"] as const;
const OUTCOMES = ["cleared", "failed", "pending"] as const;
type Stage = (typeof STAGES)[number];
type Outcome = (typeof OUTCOMES)[number];

export async function PATCH(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]/stage";
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as { stage?: string; interviewOutcome?: string };
    const stage = body.stage as Stage | undefined;
    if (!stage || !STAGES.includes(stage)) {
      return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    }
    const interviewOutcome =
      body.interviewOutcome && OUTCOMES.includes(body.interviewOutcome as Outcome)
        ? (body.interviewOutcome as Outcome)
        : undefined;

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

    // Build the update — conditional spreads keep undefined out of Firestore.
    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = {
      stage,
      stageMovedAt: now,
      stageHistory: FieldValue.arrayUnion({ stage, at: Date.now(), by: ctx.userId }),
      ...(interviewOutcome != null && { interviewOutcome }),
    };
    if (stage === "interviewing") {
      update.selectedForInterview = true;
      if (interviewOutcome == null) update.interviewOutcome = "pending";
    }
    if (stage === "offer") update.offerExtendedAt = now;
    if (stage === "hired") {
      update.hiredAt = now;
      update.offerAcceptedAt = now;
      update.interviewOutcome = "cleared";
    }
    if (stage === "withdrawn") update.offerDeclinedAt = now;

    await ref.update(update);

    // Stamp the parent JD on the FIRST hire so time-to-fill (KPI #1) and roles-filled
    // (KPI #2) anchor on when the req actually closed. First-write-wins: reuse the
    // ownership snapshot fetched above and only stamp if hiredAt isn't already set.
    if (stage === "hired" && !jdSnap.data()?.hiredAt) {
      await db.collection("jds").doc(candidateJobId).update({
        hiredAt: now,
        hiredCandidateId: id,
      });
    }

    log("info", "candidate.stage_moved", { requestId, route, candidateId: id, jobId: candidateJobId, stage, userId: ctx.userId });
    return NextResponse.json({ success: true, stage });
  } catch (err) {
    log("error", "candidate.stage_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to update stage" }, { status: 500 });
  }
}
