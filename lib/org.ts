/**
 * Organization (workspace) resolution — server-side only.
 *
 * ADR-002 makes an Organization the owning entity for every plan. Free and
 * Single Role are an "org of one"; Team is an org with multiple members. This
 * module is the single place that resolves a Firebase user to their active org
 * + role, and lazily provisions a personal org on first use.
 *
 * SAFETY / ROLLOUT
 *   This module is purely additive. It changes no existing route until that
 *   route is migrated from `requireFirebaseUser` to `requireOrgMember`. Every
 *   helper is idempotent and uses the Admin SDK (bypasses Firestore rules).
 *
 * Data shapes (see ADR-002):
 *   orgs/{orgId}                     { name, ownerUserId, plan, createdAt }
 *   orgs/{orgId}/members/{uid}       { role, joinedAt }
 *   userOrgs/{uid}                   { orgIds[], activeOrgId, updatedAt }
 */
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { requireFirebaseUser, type AuthResult } from "@/lib/auth-server";
import { PASS_SPEC, MS_PER_DAY } from "@/lib/entitlement-spec";

export type OrgRole = "owner" | "admin" | "member";
export type OrgPlan = "free" | "single_role" | "team";

const ORGS_COLLECTION = "orgs";
const MEMBERS_SUBCOLLECTION = "members";
const PASSES_SUBCOLLECTION = "passes";
const USER_ORGS_COLLECTION = "userOrgs";

export type OrgContext =
  | { ok: true; userId: string; orgId: string; role: OrgRole }
  | { ok: false; status: 401 | 403; error: string };

function asRole(value: unknown): OrgRole | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

/**
 * Idempotently ensure the user has a personal organization, returning its
 * orgId. Safe to call on every authenticated request — a single transaction on
 * userOrgs/{uid} is the idempotency anchor, so concurrent calls cannot create
 * duplicate orgs.
 */
export async function ensurePersonalOrg(userId: string): Promise<string> {
  const db = getAdminDb();
  const userOrgRef = db.collection(USER_ORGS_COLLECTION).doc(userId);
  // Auto-id is generated client-side (no round trip), so the org create can sit
  // inside the transaction alongside the userOrgs write.
  const newOrgRef = db.collection(ORGS_COLLECTION).doc();

  return db.runTransaction(async (tx) => {
    const userOrgSnap = await tx.get(userOrgRef);
    const existing = userOrgSnap.data();
    if (existing && typeof existing.activeOrgId === "string" && existing.activeOrgId) {
      return existing.activeOrgId as string;
    }

    const orgId = newOrgRef.id;
    // Grant the Free pass (100 screens, no expiry) atomically with provisioning
    // so every new org starts with its bundled entitlement. Pass shape mirrors
    // grantPass() in lib/entitlements.ts.
    const freeSpec = PASS_SPEC.free;
    const passRef = newOrgRef.collection(PASSES_SUBCOLLECTION).doc();
    const nowMs = Date.now();
    tx.set(newOrgRef, {
      name: "My Workspace",
      ownerUserId: userId,
      plan: "free" satisfies OrgPlan,
      activePassId: passRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(passRef, {
      kind: "free",
      screenCap: freeSpec.screenCap,
      roleLimit: freeSpec.roleLimit,
      atsEnabled: freeSpec.atsEnabled,
      expiresAtMs: freeSpec.validityDays != null ? nowMs + freeSpec.validityDays * MS_PER_DAY : null,
      status: "active",
      createdAtMs: nowMs,
      paddleTransactionId: null,
    });
    tx.set(newOrgRef.collection(MEMBERS_SUBCOLLECTION).doc(userId), {
      role: "owner" satisfies OrgRole,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.set(userOrgRef, {
      orgIds: [orgId],
      activeOrgId: orgId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return orgId;
  });
}

/** Read the user's active orgId without provisioning. Returns null if unset. */
export async function resolveActiveOrg(userId: string): Promise<string | null> {
  const db = getAdminDb();
  const snap = await db.collection(USER_ORGS_COLLECTION).doc(userId).get();
  const data = snap.data();
  return data && typeof data.activeOrgId === "string" && data.activeOrgId
    ? data.activeOrgId
    : null;
}

/** Return the caller's role in an org, or null if they are not a member. */
export async function getOrgRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const db = getAdminDb();
  const snap = await db
    .collection(ORGS_COLLECTION)
    .doc(orgId)
    .collection(MEMBERS_SUBCOLLECTION)
    .doc(userId)
    .get();
  return asRole(snap.data()?.role);
}

/**
 * Resolve the caller to an org membership: verify the Firebase ID token, ensure
 * a personal org exists (lazy provisioning), and return active org + role.
 *
 * Routes migrate from `requireFirebaseUser` to this. It is a strict superset:
 * the same 401/403 contract, plus orgId + role.
 */
export async function requireOrgMember(headers: Headers): Promise<OrgContext> {
  const auth: AuthResult = await requireFirebaseUser(headers);
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const userId = auth.userId;
  const orgId = await ensurePersonalOrg(userId);
  // A freshly provisioned personal org always has the caller as owner; the
  // fallback keeps this total in the (impossible) race where the members doc
  // is not yet readable.
  const role = (await getOrgRole(orgId, userId)) ?? "owner";
  return { ok: true, userId, orgId, role };
}

/** Add a user to an org with a role, and record the org on their userOrgs. */
export async function addMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
  const db = getAdminDb();
  const batch = db.batch();
  batch.set(
    db.collection(ORGS_COLLECTION).doc(orgId).collection(MEMBERS_SUBCOLLECTION).doc(userId),
    { role, joinedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  batch.set(
    db.collection(USER_ORGS_COLLECTION).doc(userId),
    { orgIds: FieldValue.arrayUnion(orgId), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
}

/** Remove a user from an org. If it was their active org, fall back to any
 *  remaining org (their personal org), else null. */
export async function removeMember(orgId: string, userId: string): Promise<void> {
  const db = getAdminDb();
  const userOrgRef = db.collection(USER_ORGS_COLLECTION).doc(userId);
  const memberRef = db
    .collection(ORGS_COLLECTION)
    .doc(orgId)
    .collection(MEMBERS_SUBCOLLECTION)
    .doc(userId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userOrgRef);
    const data = snap.data();
    const orgIds: string[] = Array.isArray(data?.orgIds)
      ? (data!.orgIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const remaining = orgIds.filter((x) => x !== orgId);
    const update: Record<string, unknown> = {
      orgIds: FieldValue.arrayRemove(orgId),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data?.activeOrgId === orgId) {
      update.activeOrgId = remaining[0] ?? null;
    }
    tx.set(userOrgRef, update, { merge: true });
    tx.delete(memberRef);
  });
}

/** Set a user's active org (the workspace the dashboard scopes to). */
export async function setActiveOrg(userId: string, orgId: string): Promise<void> {
  const db = getAdminDb();
  await db
    .collection(USER_ORGS_COLLECTION)
    .doc(userId)
    .set({ activeOrgId: orgId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
