import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { getEntitlementSummary } from "@/lib/entitlements";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/user/me
 *
 * Returns the caller's org entitlement summary (plan, screens remaining,
 * wallet balance, role limit, ATS access) plus orgId/role. Also the
 * lazy-provisioning entry point — requireOrgMember creates the personal org
 * and grants the Free pass on first call.
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const route = "/api/user/me";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const summary = await getEntitlementSummary(ctx.orgId);
    return NextResponse.json({ orgId: ctx.orgId, role: ctx.role, ...summary });
  } catch (err) {
    log("error", "user.me_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
