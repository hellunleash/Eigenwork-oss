import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/org/backfill
 *
 * One-time migration helper: stamps `orgId` (the caller's personal org) onto
 * the caller's existing JDs that predate the org model. Idempotent — only docs
 * missing `orgId` are touched, so re-running is safe. Processes up to 500 docs
 * per call (Firestore batch limit); if more remain, call again.
 *
 * No-op for accounts with no legacy data. This exists so the read-path
 * migration (jds queried by orgId) can flip without hiding pre-existing test
 * pipelines. Owner/Admin/Member can all run it for their own org's legacy docs.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/backfill";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const db = getAdminDb();
    const snap = await db.collection("jds").where("userId", "==", ctx.userId).get();

    const batch = db.batch();
    let updated = 0;
    for (const doc of snap.docs) {
      if (updated >= 500) break;
      if (!doc.data().orgId) {
        batch.update(doc.ref, { orgId: ctx.orgId });
        updated++;
      }
    }
    if (updated > 0) await batch.commit();

    const remaining = snap.docs.filter((d) => !d.data().orgId).length - updated;
    log("info", "org.backfill_done", { requestId, route, orgId: ctx.orgId, updated, remaining });
    return NextResponse.json({ updated, remaining: Math.max(0, remaining), orgId: ctx.orgId });
  } catch (err) {
    log("error", "org.backfill_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
