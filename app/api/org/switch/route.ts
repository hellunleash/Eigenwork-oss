import { NextResponse } from "next/server";
import { requireFirebaseUser } from "@/lib/auth-server";
import { getOrgRole, setActiveOrg } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/switch — body { orgId }
 *
 * Switches the caller's active org (the workspace the dashboard scopes to).
 * Only succeeds if the caller is actually a member of the target org.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/switch";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    if (!orgId) return NextResponse.json({ error: "orgId_required" }, { status: 400 });

    const role = await getOrgRole(orgId, auth.userId);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    await setActiveOrg(auth.userId, orgId);
    return NextResponse.json({ orgId, role });
  } catch (err) {
    log("error", "org.switch_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to switch org" }, { status: 500 });
  }
}
