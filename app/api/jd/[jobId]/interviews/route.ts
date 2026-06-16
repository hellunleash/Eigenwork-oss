import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/jd/[jobId]/interviews  (ADR-009 — the "Interviewing surface")
 *
 * Read-only listing of a role's shortlist with each candidate's CURRENT stage,
 * for the post-screening interview-tracking page. Deliberately lightweight:
 *   - reads the persisted shortlist (jds.matchResult.top20) — NO Gemini match
 *     (unlike GET /api/jd/match, which re-runs the match when uncached);
 *   - batch-reads the live candidate docs only for the stage fields, so the
 *     stage reflects reality after a recruiter has moved someone.
 *
 * Rank is taken from the top20 order (index+1). Owner-guarded via jds.orgId.
 * Enumeration-resistant: non-owner / missing collapses to 404.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

type ShortlistEntry = {
  id: string;
  candidateName?: string;
  score?: number;
  card?: { flag?: string | null } | null;
};

// Firestore Timestamp | epoch-ms number | {_seconds}/{seconds} → epoch ms (or null).
// The stage PATCH stamps offer/hire times as serverTimestamps; the client KPIs
// (time-to-fill #1, offer-acceptance #3) need them as plain numbers.
function tsToMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof o.toMillis === "function") return o.toMillis();
    if (typeof o._seconds === "number") return o._seconds * 1000;
    if (typeof o.seconds === "number") return o.seconds * 1000;
  }
  return null;
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/[jobId]/interviews";
  try {
    const { jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const db = getAdminDb();
    const jdSnap = await db.collection("jds").doc(jobId).get();
    if (!jdSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const jd = jdSnap.data() as Record<string, unknown>;
    if ((jd.orgId as string | undefined) !== member.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const matchResult = jd.matchResult as { top20?: unknown[] } | undefined;
    const shortlist = Array.isArray(matchResult?.top20) ? (matchResult.top20 as ShortlistEntry[]) : [];

    // Batch-read the live candidate docs for current stage fields. getAll keeps
    // this to a single round trip regardless of shortlist size (<= ~20).
    const refs = shortlist.map((c) => db.collection("candidates").doc(c.id));
    const liveSnaps = refs.length > 0 ? await db.getAll(...refs) : [];
    const liveById = new Map(liveSnaps.map((s) => [s.id, s.exists ? (s.data() as Record<string, unknown>) : null]));

    const candidates = shortlist.map((entry, i) => {
      const live = liveById.get(entry.id) ?? null;
      const stage = (typeof live?.stage === "string" ? live.stage : "screening") as string;
      const flagRaw = (live?.card as { flag?: string | null } | undefined)?.flag ?? entry.card?.flag ?? null;
      return {
        id: entry.id,
        name: (typeof live?.candidateName === "string" ? live.candidateName : entry.candidateName) || "Candidate",
        eti: typeof live?.score === "number" ? (live.score as number) : (typeof entry.score === "number" ? entry.score : null),
        flag: flagRaw || null,
        rank: i + 1,
        stage,
        interviewOutcome: (typeof live?.interviewOutcome === "string" ? live.interviewOutcome : null) as string | null,
        // ADR-009 funnel/KPI fields (stamped by PATCH /api/candidate/[id]/stage).
        selectedForInterview: live?.selectedForInterview === true,
        offerExtendedAt: tsToMs(live?.offerExtendedAt),
        hiredAt: tsToMs(live?.hiredAt),
      };
    });

    return NextResponse.json({
      jobId,
      title: typeof jd.title === "string" ? jd.title : "",
      seniority: typeof jd.seniority === "string" ? jd.seniority : "",
      hasShortlist: shortlist.length > 0,
      // jds.createdAt anchors time-to-fill (ADR-009 #1) on the client.
      createdAt: tsToMs(jd.createdAt),
      candidates,
    });
  } catch (err) {
    log("error", "jd.interviews_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load interviews" }, { status: 500 });
  }
}
