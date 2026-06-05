import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getActivePass } from "@/lib/entitlements";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/org/invite — body { email, role? }
 *
 * Creates a pending invite to the caller's active org. Owner/Admin only, and
 * only for orgs on the Team plan (the multi-member distinction vs Single Role).
 * Returns a shareable invite path; email delivery is deferred (the owner shares
 * the link). The invitee accepts via POST /api/org/invite/accept.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/invite";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const pass = await getActivePass(ctx.orgId);
    if (!pass || pass.kind !== "team") {
      return NextResponse.json({ error: "team_plan_required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" ? "admin" : "member";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "valid_email_required" }, { status: 400 });
    }

    const token = randomUUID();
    await getAdminDb().collection("invites").doc(token).set({
      orgId: ctx.orgId,
      email,
      role,
      status: "pending",
      createdBy: ctx.userId,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + INVITE_TTL_MS,
    });

    log("info", "org.invite_created", { requestId, route, orgId: ctx.orgId, email, role });
    return NextResponse.json({ token, invitePath: `/invite?token=${token}` });
  } catch (err) {
    log("error", "org.invite_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
