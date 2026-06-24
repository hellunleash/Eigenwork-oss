/**
 * JD lifecycle core (ADR-010 Phase 0 extraction).
 *
 * Lifted verbatim out of app/api/jd/save/route.ts + app/api/jd/close/route.ts so
 * the platform routes AND the future Slack agent (createJd = "mint an intake
 * link") call ONE implementation. Behavior-preserving: ownership rules are
 * unchanged — create checks the role limit (canActivateRole, org-scoped), update
 * checks the legacy per-user owner, close checks org ownership.
 */
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { canActivateRole } from "@/lib/entitlements";

export type JdInput = {
  title?: unknown;
  seniority?: unknown;
  role_category?: unknown;
  tech_stack?: unknown;
  location_type?: unknown;
  yoe_required?: unknown;
  employment_type?: unknown;
  work_auth_us_required?: unknown;
  work_auth_eu_required?: unknown;
  work_auth_provided?: unknown;
  submissionCap?: unknown;
  role_fit?: unknown;
};

/**
 * Build the persisted JD document body from raw input. Identical shape to the
 * original inline route logic (cap clamp, role_fit normalization, work-auth
 * booleans). userId + orgId are stamped on every write (ADR-002 transition:
 * orgId is the owning key, userId kept for back-compat reads).
 */
function buildJdPayload(input: JdInput, orgId: string, userId: string): Record<string, unknown> {
  const { submissionCap, role_fit } = input;
  const rawCap = typeof submissionCap === "number" ? submissionCap : parseInt(String(submissionCap), 10);
  const cap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 100;

  const roleFitDoc =
    role_fit && typeof role_fit === "object"
      ? {
          title: (role_fit as Record<string, unknown>).title ?? "",
          primary: Array.isArray((role_fit as Record<string, unknown>).primary) ? (role_fit as Record<string, unknown>).primary : [],
          secondary: Array.isArray((role_fit as Record<string, unknown>).secondary) ? (role_fit as Record<string, unknown>).secondary : [],
          tertiary: Array.isArray((role_fit as Record<string, unknown>).tertiary) ? (role_fit as Record<string, unknown>).tertiary : [],
          one_liner: (role_fit as Record<string, unknown>).one_liner ?? "",
        }
      : null;

  return {
    title: input.title ?? "",
    seniority: input.seniority ?? "",
    role_category: input.role_category ?? "",
    tech_stack: Array.isArray(input.tech_stack) ? input.tech_stack : [],
    location_type: input.location_type ?? "",
    yoe_required: input.yoe_required ?? "",
    employment_type: input.employment_type ?? "",
    work_auth_requirement: {
      us_required: Boolean(input.work_auth_us_required),
      eu_required: Boolean(input.work_auth_eu_required),
      provided: Boolean(input.work_auth_provided),
    },
    submissionCap: cap,
    ...(roleFitDoc ? { role_fit: roleFitDoc } : {}),
    userId,
    orgId,
  };
}

export type CreateJdResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; error: string; roleLimit?: number; activeRoles?: number };

/**
 * Create a new JD. Enforces the active-role limit (plan roleLimit) first, then
 * writes. Mirrors the original route's create branch exactly.
 */
export async function createJd(orgId: string, userId: string, input: JdInput): Promise<CreateJdResult> {
  const roleCheck = await canActivateRole(orgId);
  if (!roleCheck.allowed) {
    return {
      ok: false,
      status: 402,
      error: "role_limit_reached",
      roleLimit: roleCheck.roleLimit,
      activeRoles: roleCheck.activeRoles,
    };
  }

  const db = getAdminDb();
  const docRef = await db.collection("jds").add({
    ...buildJdPayload(input, orgId, userId),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, jobId: docRef.id };
}

export type UpdateJdResult =
  | { ok: true; jobId: string }
  | { ok: false; status: number; error: string };

/**
 * Update an existing JD. Ownership: the original route checks the legacy per-user
 * owner (existing.userId === userId), NOT orgId — preserved verbatim. The role
 * limit is NOT re-checked on edits.
 */
export async function updateJd(
  orgId: string,
  userId: string,
  jobId: string,
  input: JdInput
): Promise<UpdateJdResult> {
  const db = getAdminDb();
  const existing = await db.collection("jds").doc(jobId).get();
  const existingUserId = existing.data()?.userId;
  if (existingUserId && existingUserId !== userId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  await db.collection("jds").doc(jobId).update(buildJdPayload(input, orgId, userId));
  return { ok: true, jobId };
}

export type CloseJdResult = { ok: true } | { ok: false; status: number; error: string };

/** Close (archive) a JD. Org-scoped ownership, matching the original close route. */
export async function closeJd(orgId: string, jobId: string): Promise<CloseJdResult> {
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jobId).get();
  const ownerOrg = snap.data()?.orgId;
  if (!ownerOrg || ownerOrg !== orgId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  await db.collection("jds").doc(jobId).update({ isClosed: true });
  return { ok: true };
}
