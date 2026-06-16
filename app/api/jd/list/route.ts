import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Returns the user's pipelines with submissionCap, isClosed, appliedCount.
 * appliedCount = candidates where matchData.jobId == jobId and status === "submitted".
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/list";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error, pipelines: [] }, { status: ctx.status });
    const db = getAdminDb();

    const jdsSnap = await db.collection("jds").where("orgId", "==", ctx.orgId).get();
    const pipelines = await Promise.all(
      jdsSnap.docs.map(async (d) => {
        const data = d.data();
        const jobId = d.id;
        const rawCap = typeof data.submissionCap === "number" ? data.submissionCap : parseInt(String(data.submissionCap), 10);
        const submissionCap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 10;
        const isClosed = Boolean(data.isClosed);

        const candSnap = await db
          .collection("candidates")
          .where("matchData.jobId", "==", jobId)
          .where("status", "==", "submitted")
          .get();
        const appliedCount = candSnap.size;

        const createdAt = data.createdAt as { toMillis?: () => number } | null;
        const matchResult = data.matchResult as { top20?: unknown[]; completedAt?: unknown } | undefined;
        const hasMatchResult = Boolean(matchResult?.top20 && Array.isArray(matchResult.top20) && matchResult.top20.length > 0);

        // Enrichment derived from the persisted shortlist (matchResult.top20) —
        // zero extra reads, all from the jd doc already loaded. Consumed by the
        // redesigned pipelines page (ADR-009). Older list consumers ignore the
        // extra fields (structural typing), so this is backward-compatible.
        const shortlist = Array.isArray(matchResult?.top20)
          ? (matchResult.top20 as Array<{ score?: number; card?: { flag?: string | null } | null }>)
          : [];
        const shortlistCount = shortlist.length;
        const topEti = shortlist.length > 0
          ? Math.max(...shortlist.map((c) => Number(c?.score) || 0))
          : null;
        const flagsCount = shortlist.filter((c) => c?.card?.flag).length;
        const seniority = typeof data.seniority === "string" ? data.seniority : "";

        return {
          id: jobId,
          title: data.title ?? "",
          createdAt: createdAt?.toMillis?.() ?? null,
          submissionCap,
          isClosed,
          appliedCount,
          hasMatchResult,
          seniority,
          topEti,
          shortlistCount,
          flagsCount,
        };
      })
    );
    pipelines.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ pipelines });
  } catch (err) {
    log("error", "jd.list_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Failed to load pipelines" },
      { status: 500 }
    );
  }
}
