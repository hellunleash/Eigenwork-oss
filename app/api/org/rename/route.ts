import { NextResponse } from "next/server";
import { requireOrgMember, updateOrgName } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/rename — body { name }
 *
 * Rename the caller's active workspace. Owner/admin only (members can't rename
 * the shared workspace). Used by the Team page so an owner can replace the
 * auto-provisioned default name with their company name.
 */
const MAX_NAME = 60;

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/rename";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    if (name.length > MAX_NAME) return NextResponse.json({ error: "name_too_long" }, { status: 400 });

    await updateOrgName(ctx.orgId, name);
    log("info", "org.renamed", { requestId, route, orgId: ctx.orgId, userId: ctx.userId });
    return NextResponse.json({ success: true, name });
  } catch (err) {
    log("error", "org.rename_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to rename workspace" }, { status: 500 });
  }
}
