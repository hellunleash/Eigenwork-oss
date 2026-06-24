import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { composeOutreach, buildMailto } from "@/lib/outreach";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * POST /api/candidate/[id]/outreach  (ADR-010 — draft outreach field)
 *
 * Owner-only. Composes a personalized outreach email from the candidate's
 * PERSISTED card (no resume re-read, no re-scoring) and returns it plus a ready
 * `mailto:` the recruiter sends from their OWN client — we never send for them.
 * Same enumeration-resistant ownership chain as /api/candidate/[id]/stage:
 * requireOrgMember → candidate.matchData.jobId → jds.orgId === ctx.orgId. All
 * non-owner outcomes collapse to 404.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/[id]/outreach";
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const db = getAdminDb();
    const snap = await db.collection("candidates").doc(id).get();
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
    const jd = jdSnap.data() as Record<string, unknown>;

    const card = candidate.card as { title?: unknown; edge?: unknown } | undefined;
    const draft = composeOutreach({
      candidateName: typeof candidate.candidateName === "string" ? candidate.candidateName : null,
      roleTitle: typeof jd.title === "string" ? jd.title : null,
      cardTitle: typeof card?.title === "string" ? card.title : null,
      cardEdge: typeof card?.edge === "string" ? card.edge : null,
    });

    const email = typeof candidate.email === "string" && candidate.email.trim() ? candidate.email.trim() : null;
    const mailto = email ? buildMailto(email, draft) : null;

    log("info", "candidate.outreach_drafted", {
      requestId,
      route,
      candidateId: id,
      jobId: candidateJobId,
      userId: ctx.userId,
      hasEmail: Boolean(email),
    });
    return NextResponse.json({ success: true, email, mailto, subject: draft.subject, body: draft.body });
  } catch (err) {
    log("error", "candidate.outreach_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to draft outreach" }, { status: 500 });
  }
}
