import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { createJd, updateJd } from "@/lib/jd";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Saves the confirmed JD (from the confirm page) so /api/jd/match can read
 * role_category, location_type, employment_type, work_auth_requirement, etc.
 * If body.jobId is provided, updates the existing job document. (ADR-010
 * Phase 0: the create/update logic now lives in lib/jd.ts, shared with the
 * Slack agent's intake-link tool.)
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/save";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await req.json();
    const existingJobId = body.jobId;

    if (existingJobId && typeof existingJobId === "string") {
      const result = await updateJd(ctx.orgId, ctx.userId, existingJobId, body);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ success: true, jobId: result.jobId });
    }

    const result = await createJd(ctx.orgId, ctx.userId, body);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.roleLimit != null && { roleLimit: result.roleLimit }),
          ...(result.activeRoles != null && { activeRoles: result.activeRoles }),
        },
        { status: result.status }
      );
    }
    return NextResponse.json({ success: true, jobId: result.jobId });
  } catch (err) {
    log("error", "jd.save_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to save JD" }, { status: 500 });
  }
}
