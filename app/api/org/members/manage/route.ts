import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember, removeMember, getOrgRole } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/members/manage — body { action: "remove" | "role", uid, role? }
 *
 * Member admin. Permission model:
 *   - Owner/Admin may remove members. Admins cannot touch other admins or the
 *     owner; only the owner can.
 *   - Only the owner may change roles. The owner's role is immutable here.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/members/manage";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const targetUid = typeof body.uid === "string" ? body.uid : "";
    if (!targetUid) return NextResponse.json({ error: "uid_required" }, { status: 400 });
    if (targetUid === ctx.userId) {
      return NextResponse.json({ error: "cannot_modify_self" }, { status: 400 });
    }

    const targetRole = await getOrgRole(ctx.orgId, targetUid);
    if (!targetRole) return NextResponse.json({ error: "not_a_member" }, { status: 404 });
    if (targetRole === "owner") {
      return NextResponse.json({ error: "cannot_modify_owner" }, { status: 403 });
    }
    if (targetRole === "admin" && ctx.role !== "owner") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (action === "remove") {
      await removeMember(ctx.orgId, targetUid);
      log("info", "org.member_removed", { requestId, route, orgId: ctx.orgId, targetUid });
      return NextResponse.json({ success: true });
    }

    if (action === "role") {
      if (ctx.role !== "owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const newRole = body.role === "admin" ? "admin" : "member";
      await getAdminDb()
        .collection("orgs")
        .doc(ctx.orgId)
        .collection("members")
        .doc(targetUid)
        .set({ role: newRole }, { merge: true });
      log("info", "org.member_role_changed", { requestId, route, orgId: ctx.orgId, targetUid, newRole });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (err) {
    log("error", "org.members_manage_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to manage member" }, { status: 500 });
  }
}
