import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Saves the confirmed JD (from confirm page) to Firestore so /api/jd/match
 * can access role_category, location_type, employment_type, work_auth_requirement, etc.
 * If body.jobId is provided, updates the existing job document instead of creating one.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/save";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await req.json();

    const {
      jobId: existingJobId,
      title,
      seniority,
      role_category,
      tech_stack,
      location_type,
      yoe_required,
      employment_type,
      work_auth_us_required,
      work_auth_eu_required,
      work_auth_provided,
      submissionCap,
      role_fit,
    } = body;

    const rawCap = typeof submissionCap === "number" ? submissionCap : parseInt(String(submissionCap), 10);
    const cap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 100;

    const roleFitDoc =
      role_fit && typeof role_fit === "object"
        ? {
            title: role_fit.title ?? "",
            primary: Array.isArray(role_fit.primary) ? role_fit.primary : [],
            secondary: Array.isArray(role_fit.secondary) ? role_fit.secondary : [],
            tertiary: Array.isArray(role_fit.tertiary) ? role_fit.tertiary : [],
            one_liner: role_fit.one_liner ?? "",
          }
        : null;

    const payload = {
      title: title ?? "",
      seniority: seniority ?? "",
      role_category: role_category ?? "",
      tech_stack: Array.isArray(tech_stack) ? tech_stack : [],
      location_type: location_type ?? "",
      yoe_required: yoe_required ?? "",
      employment_type: employment_type ?? "",
      work_auth_requirement: {
        us_required: Boolean(work_auth_us_required),
        eu_required: Boolean(work_auth_eu_required),
        provided: Boolean(work_auth_provided),
      },
      submissionCap: cap,
      ...(roleFitDoc ? { role_fit: roleFitDoc } : {}),
      userId: ctx.userId,
      // ADR-002: orgId is the new owning key. Written alongside userId during
      // the transition so existing userId-scoped reads keep working until the
      // read paths are migrated to orgId.
      orgId: ctx.orgId,
    };

    const db = getAdminDb();

    if (existingJobId && typeof existingJobId === "string") {
      // Authorization: only owner can update
      const existing = await db.collection("jds").doc(existingJobId).get();
      const existingUserId = existing.data()?.userId;
      if (existingUserId && existingUserId !== ctx.userId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      await db.collection("jds").doc(existingJobId).update(payload);
      return NextResponse.json({ success: true, jobId: existingJobId });
    }

    const docRef = await db.collection("jds").add({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, jobId: docRef.id });
  } catch (err) {
    log("error", "jd.save_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Failed to save JD" },
      { status: 500 }
    );
  }
}
