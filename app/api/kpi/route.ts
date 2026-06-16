import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";
import { kpiSnapshotDocPath, type KpiSnapshot } from "@/lib/kpi/types";

/**
 * GET /api/kpi  (ADR-009 — KPI snapshot reader)
 *
 * Org-scoped read of the cached kpi_snapshots/{orgId} doc the cron
 * (worker /worker/kpi-aggregate) writes. ONE Firestore read — all aggregation
 * happened in the cron, never in front of the user. Returns { snapshot: null }
 * when the cron has not yet run for this org (the dashboard renders empty).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/kpi";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const db = getAdminDb();
    const snap = await db.doc(kpiSnapshotDocPath(ctx.orgId)).get();
    const data = snap.exists ? (snap.data() as KpiSnapshot) : null;

    return NextResponse.json({ snapshot: data ?? null });
  } catch (err) {
    log("error", "kpi.read_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load KPIs" }, { status: 500 });
  }
}
