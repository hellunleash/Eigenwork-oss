import { NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/org/members
 *
 * Lists members of the caller's active org (with email/name resolved from
 * Firebase Auth) plus, for owner/admin, the pending invites. `yourRole` lets
 * the UI decide which controls to show.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/members";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const db = getAdminDb();
    const memSnap = await db.collection("orgs").doc(ctx.orgId).collection("members").get();
    const members = await Promise.all(
      memSnap.docs.map(async (d) => {
        const uid = d.id;
        let email: string | null = null;
        let name: string | null = null;
        try {
          const u = await getAdminAuth().getUser(uid);
          email = u.email ?? null;
          name = u.displayName ?? null;
        } catch {
          /* auth record may be gone; leave nulls */
        }
        return { uid, role: d.data()?.role ?? "member", email, name, isYou: uid === ctx.userId };
      })
    );

    let invites: Array<{ token: string; email: string; role: string }> = [];
    if (ctx.role === "owner" || ctx.role === "admin") {
      // Query by orgId only (single-field index) and filter status in code to
      // avoid a composite index.
      const invSnap = await db.collection("invites").where("orgId", "==", ctx.orgId).get();
      invites = invSnap.docs
        .filter((d) => d.data()?.status === "pending")
        .map((d) => ({
          token: d.id,
          email: String(d.data()?.email ?? ""),
          role: String(d.data()?.role ?? "member"),
        }));
    }

    return NextResponse.json({ members, invites, yourRole: ctx.role });
  } catch (err) {
    log("error", "org.members_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
