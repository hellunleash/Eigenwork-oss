import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/bootstrap
 *
 * Ensures the authenticated user has a personal organization and returns
 * { orgId, role }. Idempotent — safe to call on every dashboard load. This is
 * the lazy-provisioning entry point referenced in ADR-002 / the build plan;
 * the frontend will call it on mount in a later phase. Until then it is a
 * standalone, additive endpoint that changes no existing behaviour.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/bootstrap";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    return NextResponse.json({ orgId: ctx.orgId, role: ctx.role });
  } catch (err) {
    log("error", "org.bootstrap_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to bootstrap organization" }, { status: 500 });
  }
}
