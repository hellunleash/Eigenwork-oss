import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { moveStage, STAGES, OUTCOMES, type Stage, type Outcome } from "@/lib/stage";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * PATCH /api/candidate/[id]/stage  (ADR-009 stage transitions; ADR-010 Phase 0:
 * logic extracted to lib/stage.ts, shared with the Slack agent's move-stage tool)
 *
 * Owner-only write that moves a candidate through the hiring funnel and stamps
 * the KPI timestamps. Enumeration-resistant: all non-owner outcomes collapse to
 * 404.
 *
 * Body: { stage, interviewOutcome? }
 *   stage ∈ screening | interviewing | offer | hired | rejected | withdrawn
 *   interviewOutcome ∈ cleared | failed | pending
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

    const result = await moveStage(ctx.orgId, ctx.userId, id, stage, interviewOutcome);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    log("info", "candidate.stage_moved", {
      requestId,
      route,
      candidateId: id,
      jobId: result.jobId,
      stage: result.stage,
      userId: ctx.userId,
    });
    return NextResponse.json({ success: true, stage: result.stage });
  } catch (err) {
    log("error", "candidate.stage_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to update stage" }, { status: 500 });
  }
}
