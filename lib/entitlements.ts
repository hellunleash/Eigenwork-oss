/**
 * Entitlements — org-scoped Candidate-Screen accounting (ADR-002).
 *
 * Two mechanisms:
 *   1. PASS   — the bundled entitlement you bought (free / single_role / team).
 *               Lives at orgs/{orgId}/passes/{passId}; usage is a sharded
 *               counter at orgs/{orgId}/passes/{passId}/usage/{shard}.
 *   2. WALLET — prepaid overage (Team top-ups). A sharded balance at
 *               orgs/{orgId}/screenWallet/{shard}. Consumed only after the
 *               active pass bucket is exhausted.
 *
 * The hot path (consumeEval) mirrors applyCreditMutation in lib/credit-ledger.ts:
 * an optimistic pre-check outside the transaction, then a single-shard write +
 * an idempotent ledger doc inside it. Bounded overshoot under concurrent
 * bursts is accepted, same as the credit system (see that file's comment).
 *
 * SAFETY: additive. Nothing reads these helpers until the eval gate / worker
 * debit are migrated to them (the next Phase-2 step).
 */
import { randomUUID } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import type { CollectionReference, DocumentReference, Firestore } from "firebase-admin/firestore";
import { PASS_SPEC, SCREEN_SHARD_COUNT, MS_PER_DAY, type PassKind } from "@/lib/entitlement-spec";

const ORGS = "orgs";
const PASSES = "passes";
const USAGE = "usage";
const WALLET = "screenWallet";
const LEDGER = "screenLedger";
const JDS = "jds";

export type EvalDecision =
  | { allowed: true; via: "pass" | "wallet" }
  | { allowed: false; reason: "no_screens" };

export type ActivePass = {
  passId: string;
  kind: PassKind;
  screenCap: number;
  roleLimit: number;
  atsEnabled: boolean;
  expiresAtMs: number | null;
};

function randomShardId(): string {
  return String(Math.floor(Math.random() * SCREEN_SHARD_COUNT));
}

async function sumShards(coll: CollectionReference): Promise<number> {
  const snap = await coll.get();
  let total = 0;
  for (const d of snap.docs) {
    const v = (d.data() ?? {}).value;
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

function orgRef(db: Firestore, orgId: string) {
  return db.collection(ORGS).doc(orgId);
}
function walletColl(db: Firestore, orgId: string): CollectionReference {
  return orgRef(db, orgId).collection(WALLET);
}
function usageColl(db: Firestore, orgId: string, passId: string): CollectionReference {
  return orgRef(db, orgId).collection(PASSES).doc(passId).collection(USAGE);
}

function passIsValid(p: ActivePass, nowMs: number): boolean {
  return p.expiresAtMs == null || nowMs < p.expiresAtMs;
}

/** Resolve the org's active pass (the bundled entitlement), or null. */
export async function getActivePass(orgId: string, db: Firestore = getAdminDb()): Promise<ActivePass | null> {
  const orgSnap = await orgRef(db, orgId).get();
  const activePassId = orgSnap.data()?.activePassId;
  if (typeof activePassId !== "string" || !activePassId) return null;
  const passSnap = await orgRef(db, orgId).collection(PASSES).doc(activePassId).get();
  const d = passSnap.data();
  if (!d) return null;
  const kind = d.kind as PassKind;
  const spec = PASS_SPEC[kind];
  if (!spec) return null;
  return {
    passId: activePassId,
    kind,
    screenCap: typeof d.screenCap === "number" ? d.screenCap : spec.screenCap,
    roleLimit: typeof d.roleLimit === "number" ? d.roleLimit : spec.roleLimit,
    atsEnabled: Boolean(d.atsEnabled),
    expiresAtMs: typeof d.expiresAtMs === "number" ? d.expiresAtMs : null,
  };
}

/**
 * Grant a new pass and make it active. NOT idempotent — callers (the Paddle
 * webhook) dedupe on the transaction id before calling. The Free pass is
 * granted atomically inside ensurePersonalOrg, not here.
 */
export async function grantPass(
  orgId: string,
  kind: PassKind,
  opts?: { paddleTransactionId?: string }
): Promise<string> {
  const db = getAdminDb();
  const spec = PASS_SPEC[kind];
  const ref = orgRef(db, orgId).collection(PASSES).doc();
  const now = Date.now();
  await ref.set({
    kind,
    screenCap: spec.screenCap,
    roleLimit: spec.roleLimit,
    atsEnabled: spec.atsEnabled,
    expiresAtMs: spec.validityDays != null ? now + spec.validityDays * MS_PER_DAY : null,
    status: "active",
    createdAtMs: now,
    paddleTransactionId: opts?.paddleTransactionId ?? null,
  });
  await orgRef(db, orgId).set({ activePassId: ref.id, plan: kind }, { merge: true });
  return ref.id;
}

/** Add screens to the org's overage wallet (Team top-up). Idempotent on opId. */
export async function creditWallet(args: {
  orgId: string;
  screens: number;
  opId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ opId: string; applied: boolean }> {
  const { orgId, screens } = args;
  const opId = args.opId ?? randomUUID();
  const db = getAdminDb();
  const ledgerRef = db.collection(LEDGER).doc(opId);
  const shardRef = walletColl(db, orgId).doc(randomShardId());
  const applied = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return false;
    tx.set(ledgerRef, {
      orgId,
      delta: screens,
      source: "wallet_topup",
      metadata: args.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(shardRef, { value: FieldValue.increment(screens), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  return { opId, applied };
}

/** Read-only gate: may this org run one more Candidate Screen right now? */
export async function canEvaluate(orgId: string): Promise<EvalDecision> {
  const db = getAdminDb();
  const now = Date.now();
  const pass = await getActivePass(orgId, db);
  if (pass && passIsValid(pass, now)) {
    const used = await sumShards(usageColl(db, orgId, pass.passId));
    if (used < pass.screenCap) return { allowed: true, via: "pass" };
  }
  const wallet = await sumShards(walletColl(db, orgId));
  if (wallet > 0) return { allowed: true, via: "wallet" };
  return { allowed: false, reason: "no_screens" };
}

/**
 * Spend one Candidate Screen on success. Idempotent on opId. Draws from the
 * active pass bucket first, then the overage wallet. Optimistic pre-check +
 * single-shard write, exactly like applyCreditMutation.
 */
export async function consumeEval(args: {
  orgId: string;
  jobId: string | null;
  opId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ opId: string; applied: boolean; via?: "pass" | "wallet"; reason?: "duplicate" | "no_screens" }> {
  const { orgId } = args;
  const opId = args.opId ?? randomUUID();
  const db = getAdminDb();
  const ledgerRef = db.collection(LEDGER).doc(opId);
  const now = Date.now();

  let target: "pass" | "wallet" | null = null;
  let shardRef: DocumentReference | null = null;

  const pass = await getActivePass(orgId, db);
  if (pass && passIsValid(pass, now)) {
    const used = await sumShards(usageColl(db, orgId, pass.passId));
    if (used < pass.screenCap) {
      target = "pass";
      shardRef = usageColl(db, orgId, pass.passId).doc(randomShardId());
    }
  }
  if (!target) {
    const wallet = await sumShards(walletColl(db, orgId));
    if (wallet > 0) {
      target = "wallet";
      shardRef = walletColl(db, orgId).doc(randomShardId());
    }
  }

  if (!target || !shardRef) {
    // Submission was gated by canEvaluate; reaching here means a concurrent
    // burst drained the last screen between gate and debit. Bounded, logged
    // by the caller.
    return { opId, applied: false, reason: "no_screens" };
  }

  const delta = target === "pass" ? 1 : -1; // pass usage counts up; wallet counts down
  const finalTarget = target;
  const finalShard = shardRef;
  const applied = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return false;
    tx.set(ledgerRef, {
      orgId,
      jobId: args.jobId ?? null,
      target: finalTarget,
      delta,
      source: "screen_consume",
      metadata: args.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(finalShard, { value: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });

  if (!applied) return { opId, applied: false, reason: "duplicate" };
  return { opId, applied: true, via: finalTarget };
}

/** Can this org open one more active role (open JD) under its plan? */
export async function canActivateRole(
  orgId: string
): Promise<{ allowed: boolean; roleLimit: number; activeRoles: number }> {
  const db = getAdminDb();
  const pass = await getActivePass(orgId, db);
  const roleLimit = pass ? pass.roleLimit : 0;
  // orgId is single-field indexed; isClosed is filtered in code so no
  // composite index is required.
  const snap = await db.collection(JDS).where("orgId", "==", orgId).get();
  const activeRoles = snap.docs.filter((d) => d.data()?.isClosed !== true).length;
  return { allowed: activeRoles < roleLimit, roleLimit, activeRoles };
}

/** Does this org's plan include ATS push (Team)? */
export async function canUseAts(orgId: string): Promise<boolean> {
  const pass = await getActivePass(orgId);
  return Boolean(pass && pass.atsEnabled && passIsValid(pass, Date.now()));
}

/** Dashboard / billing-UI summary for an org. */
export async function getEntitlementSummary(orgId: string): Promise<{
  plan: PassKind | null;
  screenCap: number;
  screensUsed: number;
  screensRemaining: number;
  walletBalance: number;
  expiresAtMs: number | null;
  atsEnabled: boolean;
  roleLimit: number;
}> {
  const db = getAdminDb();
  const pass = await getActivePass(orgId, db);
  const walletBalance = await sumShards(walletColl(db, orgId));
  if (!pass) {
    return {
      plan: null,
      screenCap: 0,
      screensUsed: 0,
      screensRemaining: walletBalance,
      walletBalance,
      expiresAtMs: null,
      atsEnabled: false,
      roleLimit: 0,
    };
  }
  const screensUsed = await sumShards(usageColl(db, orgId, pass.passId));
  const bucketRemaining = Math.max(0, pass.screenCap - screensUsed);
  return {
    plan: pass.kind,
    screenCap: pass.screenCap,
    screensUsed,
    screensRemaining: bucketRemaining + walletBalance,
    walletBalance,
    expiresAtMs: pass.expiresAtMs,
    atsEnabled: pass.atsEnabled,
    roleLimit: pass.roleLimit,
  };
}
