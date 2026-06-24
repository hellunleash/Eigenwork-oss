import { NextResponse } from "next/server";
import { buildEtiDistributionFromScores } from "@/lib/eti-distribution";
import { requireOrgMember } from "@/lib/org";
import { runMatch } from "@/lib/match";
import { getRequestId, log, timeMs, type LogContext } from "@/lib/server-logger";

/**
 * Match route (ADR-010 Phase 0): a thin front door over the shared match core
 * in lib/match.ts. The core (role-fit Gemini classification, ETI/work-auth
 * filters, top-20 enrichment, cache) is shared with worker/index.ts handleMatch
 * — they no longer fork. This route supplies the ORG-scoped ownership rule.
 *
 * Scale envelope (sync; see FAANG-Analysis.txt): ~10s at 500-2k candidates,
 * ~50s at 10k (near maxDuration). Above ~10k, move to an async job pattern.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ownership: the route is org-scoped (ADR-002 org-as-owner).
const ownsJd = (orgId: string) => (jd: Record<string, unknown>) =>
  typeof jd.orgId === "string" && jd.orgId === orgId;

function statusForError(error: string): number {
  return error === "Job not found" ? 404 : error === "Forbidden" ? 403 : 400;
}

/** GET /api/jd/match?jobId=ABC123 */
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/match";
  try {
    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ success: false, error: member.error }, { status: member.status });

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    }
    const t = timeMs();
    const ctx: LogContext = { requestId, route, userId: member.userId, jobId };
    const result = await runMatch(jobId, ctx, ownsJd(member.orgId));
    if (!result.success && result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: statusForError(result.error) });
    }
    log("info", "jd.match_ok", { requestId, route, jobId, userId: member.userId, latencyMs: t() });
    return NextResponse.json({
      success: true,
      top20: result.top20 ?? [],
      etiDistribution: result.etiDistribution ?? buildEtiDistributionFromScores([]),
      seniority: result.seniority ?? "",
    });
  } catch (err) {
    log("error", "jd.match_get_failed", { requestId, route }, err);
    return NextResponse.json(
      { success: false, error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/jd/match — body: { jobId } (legacy { jd } body mode is unauthorized). */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/match";
  try {
    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ success: false, error: member.error }, { status: member.status });

    const body = await req.json().catch(() => ({}));
    const jdId = body.jobId ?? body.jdId;
    const jdBody = body.jd;

    if (jdId) {
      const t = timeMs();
      const ctx: LogContext = { requestId, route, userId: member.userId, jobId: String(jdId) };
      const result = await runMatch(String(jdId), ctx, ownsJd(member.orgId));
      if (!result.success && result.error) {
        return NextResponse.json({ success: false, error: result.error }, { status: statusForError(result.error) });
      }
      log("info", "jd.match_ok", { requestId, route, jobId: String(jdId), userId: member.userId, latencyMs: t() });
      return NextResponse.json({
        success: true,
        top20: result.top20 ?? [],
        etiDistribution: result.etiDistribution ?? buildEtiDistributionFromScores([]),
        seniority: result.seniority ?? "",
      });
    }

    if (!jdBody) {
      return NextResponse.json({ error: "jdId or jd required" }, { status: 400 });
    }

    // Backward-compat body mode is not authorized (it can bypass owner checks).
    return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
  } catch (err) {
    log("error", "jd.match_post_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}
