/**
 * Interview credits — a SEPARATE prepaid balance for the Phase-2 interview loop,
 * fully DISTINCT from the screen wallet (résumé-screening credits). Interview usage
 * must never draw down `screensRemaining`, and screen usage must never touch this.
 *
 * Pricing (2026-07-20): a per-candidate SKU at $29 — a candidate's WHOLE loop (screen
 * + take-home + system-design + report) consumes exactly ONE interview credit
 * (meterCandidateOnce → consumeInterviewCredit, idempotent per candidate).
 *
 * Modeled on lib/entitlements.ts (creditWallet/consumeEval) but with its OWN
 * collections so the balances are independent. Volume is low (5–10/role), so a single
 * balance doc + a real transaction is enough — no sharding, and no bounded-overshoot
 * (the transaction reads the balance before debiting). Idempotent by op id.
 *
 * Crediting in prod = a DISTINCT Paddle Product/Price ("Interview Credit", one-time,
 * quantity-based). Its `transaction.completed` webhook routes here by `price_id` and
 * calls `creditInterviewCredits` (credit-pack pattern — Paddle's metered billing is
 * non-native; see docs/phase2-northstar.md). `grantInterviewCredits` is the manual /
 * dev / QA grant path (mirrors grantPass). The Paddle webhook branch is NOT wired yet
 * (prod-billing follow-up); this module + the manual grant make the separation real now.
 */
import { randomUUID } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

const ORGS = "orgs";
const WALLET = "interviewWallet"; // orgs/{orgId}/interviewWallet/balance
const BALANCE_DOC = "balance";
const LEDGER = "interviewLedger"; // interviewLedger/{opId}

/** Quantity bounds for an interview-credit purchase (Paddle webhook defense-in-depth,
 *  mirroring WALLET_MIN/MAX_QTY). A webhook quantity outside this range is refused +
 *  logged for manual review rather than crediting an unbounded balance. */
export const INTERVIEW_CREDIT_MIN_QTY = 1;
export const INTERVIEW_CREDIT_MAX_QTY = 1000;

function balanceRef(db: Firestore, orgId: string) {
  return db.collection(ORGS).doc(orgId).collection(WALLET).doc(BALANCE_DOC);
}

/** Current interview-credit balance for an org (never negative). */
export async function interviewCreditsRemaining(orgId: string): Promise<number> {
  const snap = await balanceRef(getAdminDb(), orgId).get();
  const v = snap.data()?.value;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Add interview credits (Paddle credit-pack purchase, or manual grant). Idempotent on
 * opId — the Paddle webhook passes a transaction-id-based opId so a retried webhook
 * never double-credits.
 */
export async function creditInterviewCredits(args: {
  orgId: string;
  credits: number;
  opId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ opId: string; applied: boolean }> {
  const { orgId, credits } = args;
  const db = getAdminDb();
  const opId = args.opId ?? randomUUID();
  const ledgerRef = db.collection(LEDGER).doc(opId);
  const bal = balanceRef(db, orgId);
  const applied = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return false;
    tx.set(ledgerRef, {
      orgId,
      delta: credits,
      source: "interview_topup",
      metadata: args.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(bal, { value: FieldValue.increment(credits), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  return { opId, applied };
}

/** Manual / dev / QA grant of interview credits (mirrors grantPass for the screen plan). */
export async function grantInterviewCredits(orgId: string, credits: number, opId?: string): Promise<void> {
  await creditInterviewCredits({ orgId, credits, opId, metadata: { source: "manual_grant" } });
}

/**
 * Spend ONE interview credit for a candidate's whole loop. Idempotent per candidate
 * (opId `interview:<candidateId>`) — the first round invited debits, every later round
 * is a `duplicate` no-op, so an already-charged candidate is never blocked. Atomic:
 * the transaction reads the ledger + balance before debiting, so it can't go negative.
 */
export async function consumeInterviewCredit(args: {
  orgId: string;
  candidateId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ applied: boolean; reason?: "duplicate" | "no_credits" }> {
  const db = getAdminDb();
  const ledgerRef = db.collection(LEDGER).doc(`interview:${args.candidateId}`);
  const bal = balanceRef(db, args.orgId);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return { applied: false, reason: "duplicate" as const };
    const balSnap = await tx.get(bal);
    const cur = typeof balSnap.data()?.value === "number" ? (balSnap.data()!.value as number) : 0;
    if (cur <= 0) return { applied: false, reason: "no_credits" as const };
    tx.set(ledgerRef, {
      orgId: args.orgId,
      delta: -1,
      source: "interview_consume",
      metadata: args.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(bal, { value: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { applied: true };
  });
}
