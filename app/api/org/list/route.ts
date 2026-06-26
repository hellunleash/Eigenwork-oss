import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/org/list — the orgs the caller belongs to (for the org switcher).
 * Uses requireOrgMember so the personal org is provisioned if missing.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/list";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const db = getAdminDb();
    const userOrgs = (await db.collection("userOrgs").doc(ctx.userId).get()).data();
    const orgIds: string[] = Array.isArray(userOrgs?.orgIds)
      ? (userOrgs!.orgIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const activeOrgId = typeof userOrgs?.activeOrgId === "string" ? userOrgs.activeOrgId : ctx.orgId;

    const orgs = await Promise.all(
      orgIds.map(async (orgId) => {
        const [orgSnap, memberSnap] = await Promise.all([
          db.collection("orgs").doc(orgId).get(),
          db.collection("orgs").doc(orgId).collection("members").doc(ctx.userId).get(),
        ]);
        const od = orgSnap.data();
        return {
          orgId,
          name: typeof od?.name === "string" ? od.name : "Workspace",
          plan: od?.plan ?? null,
          role: memberSnap.data()?.role ?? null,
          // True when the caller owns this org. Lets the UI label the caller's
          // own solo workspace as "Personal" so it isn't confused with a shared
          // team workspace that happens to share the default "My Workspace" name.
          isOwn: od?.ownerUserId === ctx.userId,
          isActive: orgId === activeOrgId,
        };
      })
    );

    return NextResponse.json({ orgs, activeOrgId });
  } catch (err) {
    log("error", "org.list_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load orgs" }, { status: 500 });
  }
}
