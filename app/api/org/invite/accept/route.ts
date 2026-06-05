import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireFirebaseUser } from "@/lib/auth-server";
import { ensurePersonalOrg, addMember, setActiveOrg, type OrgRole } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/invite/accept — body { token }
 *
 * The invitee (already signed in with Google) joins the org the invite points
 * to. The invite's email must match the caller's verified email. On success
 * the user becomes a member and their active org is switched to the new org so
 * they land in the team workspace.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/invite/accept";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const rawEmail = (auth.token as { email?: unknown } | null | undefined)?.email;
    const userEmail = typeof rawEmail === "string" ? rawEmail.toLowerCase() : null;

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return NextResponse.json({ error: "token_required" }, { status: 400 });

    const db = getAdminDb();
    const inviteRef = db.collection("invites").doc(token);
    const invite = (await inviteRef.get()).data();
    if (!invite || invite.status !== "pending") {
      return NextResponse.json({ error: "invite_invalid" }, { status: 404 });
    }
    if (typeof invite.expiresAtMs === "number" && Date.now() > invite.expiresAtMs) {
      return NextResponse.json({ error: "invite_expired" }, { status: 410 });
    }
    if (typeof invite.email === "string" && userEmail && invite.email.toLowerCase() !== userEmail) {
      return NextResponse.json({ error: "invite_email_mismatch" }, { status: 403 });
    }
    const orgId = typeof invite.orgId === "string" ? invite.orgId : null;
    if (!orgId) return NextResponse.json({ error: "invite_invalid" }, { status: 404 });

    // Make sure the accepting user has a userOrgs record, then join the team org.
    await ensurePersonalOrg(auth.userId);
    const role: OrgRole = invite.role === "admin" ? "admin" : "member";
    await addMember(orgId, auth.userId, role);
    await setActiveOrg(auth.userId, orgId);
    await inviteRef.set(
      { status: "accepted", acceptedBy: auth.userId, acceptedAtMs: Date.now() },
      { merge: true }
    );

    log("info", "org.invite_accepted", { requestId, route, orgId, userId: auth.userId });
    return NextResponse.json({ orgId });
  } catch (err) {
    log("error", "org.invite_accept_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
