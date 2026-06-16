import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Period key shape, e.g. "2026-Q3". Used by KPI #2 (roles filled vs target).
const PERIOD_RE = /^\d{4}-Q[1-4]$/;

/**
 * GET /api/org/targets
 *
 * Returns the caller's active org hiring targets as a period→target map
 * (`{ "2026-Q3": 16 }`), read from `org_targets/{orgId}`. Any org member may
 * read. Absent doc → empty map.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/targets";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const snap = await getAdminDb().collection("org_targets").doc(ctx.orgId).get();
    const data = snap.data();
    return NextResponse.json({ targets: data ?? {} });
  } catch (err) {
    log("error", "org.targets_read_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load targets" }, { status: 500 });
  }
}

/**
 * PUT /api/org/targets — body { period, target }
 *
 * Sets a single per-period hiring target on the caller's active org. Owner/Admin
 * only. `period` must match `YYYY-Q[1-4]`; `target` must be a positive integer.
 * Written with merge so other periods are preserved.
 */
export async function PUT(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/org/targets";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const period = typeof body.period === "string" ? body.period.trim() : "";
    const target = body.target;
    if (!PERIOD_RE.test(period)) {
      return NextResponse.json({ error: "invalid_period" }, { status: 400 });
    }
    if (typeof target !== "number" || !Number.isInteger(target) || target <= 0) {
      return NextResponse.json({ error: "invalid_target" }, { status: 400 });
    }

    await getAdminDb()
      .collection("org_targets")
      .doc(ctx.orgId)
      .set({ [period]: target }, { merge: true });

    log("info", "org.target_set", { requestId, route, orgId: ctx.orgId, period, target });
    return NextResponse.json({ ok: true, period, target });
  } catch (err) {
    log("error", "org.target_set_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to set target" }, { status: 500 });
  }
}
