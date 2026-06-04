import { createHash, randomUUID } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { pickCreditShardRef, readShardedCreditTotal } from "@/lib/credit-shards";

const LEDGER_COLLECTION = "creditLedger";
const PADDLE_PROCESSED_COLLECTION = "processedPaddleTransactions";
const USERS_COLLECTION = "users";

export type CreditSource = "evaluation" | "paddle" | "new-intake" | "admin";
/** Why a mutation didn't apply. "duplicate" = idempotency dedup hit
 *  (replay-safe, expected). "insufficient_balance" = guard rejected a
 *  debit that would drive the user negative. Absent on applied=true. */
export type CreditNotAppliedReason = "duplicate" | "insufficient_balance";

export function makeOpId(parts: Record<string, string | number | null | undefined>): string {
  const stable = JSON.stringify(parts);
  return createHash("sha256").update(stable).digest("hex");
}

/** Read the user's current balance: legacy users/{uid}.eigenCredits + sum
 *  of all credit shards. Lives here as a private helper so the guard
 *  in applyCreditMutation reads exactly the same shape getUserProfile
 *  returns to the dashboard. */
async function readCurrentBalance(userId: string): Promise<number> {
  const db = getAdminDb();
  const [userSnap, shardedTotal] = await Promise.all([
    db.collection(USERS_COLLECTION).doc(userId).get(),
    readShardedCreditTotal(userId, db),
  ]);
  const data = userSnap.data();
  const legacy = typeof data?.eigenCredits === "number" ? data.eigenCredits : 0;
  return legacy + shardedTotal;
}

export async function applyCreditMutation(args: {
  userId: string;
  delta: number;
  source: CreditSource;
  opId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ opId: string; applied: boolean; reason?: CreditNotAppliedReason }> {
  const { userId, delta, source } = args;
  const opId = args.opId ?? randomUUID();
  const db = getAdminDb();

  // Negative-balance guard (debits only).
  //
  // The transaction below writes a single shard and the ledger doc. We
  // cannot cheaply read all shards inside the transaction without locking
  // every shard, which would defeat the whole point of sharding. Instead
  // we do an optimistic pre-check outside the transaction.
  //
  // Race window: between this read and the transactional write, another
  // concurrent debit could land. If two debits race past the check at
  // balance=1, both will succeed and balance goes to -1. The window is
  // microseconds and the harm is bounded to a small overshoot, which is
  // strictly better than the unbounded overshoot we had before this guard.
  //
  // Credits-only and refund paths (delta >= 0) skip the check entirely so
  // Paddle webhooks and new-intake restorations always apply.
  if (delta < 0) {
    const current = await readCurrentBalance(userId);
    if (current + delta < 0) {
      return { opId, applied: false, reason: "insufficient_balance" };
    }
  }

  const ledgerRef = db.collection(LEDGER_COLLECTION).doc(opId);
  // Sharded write: pick a random shard once per call (not inside the
  // transaction — the shard choice itself is not contended, only the write).
  // This drops single-doc write contention on users/{uid} and raises the
  // sustained credit-mutation rate from ~1/s to ~CREDIT_SHARD_COUNT/s.
  // See lib/credit-shards.ts and FAANG-Analysis.txt 2026-06-03 entry.
  const shardRef = pickCreditShardRef(userId, db);

  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return { applied: false as const };

    tx.set(ledgerRef, {
      userId,
      delta,
      source,
      metadata: args.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(
      shardRef,
      {
        value: FieldValue.increment(delta),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { applied: true as const };
  });

  if (!result.applied) {
    return { opId, applied: false, reason: "duplicate" };
  }
  return { opId, applied: true };
}

export async function markPaddleTransactionProcessed(txnId: string, opId: string): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection(PADDLE_PROCESSED_COLLECTION).doc(txnId);
  const applied = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { opId, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  return applied;
}

