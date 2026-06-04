import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { pickCreditShardRef, readShardedCreditTotal } from "@/lib/credit-shards";

const USERS_COLLECTION = "users";

/**
 * Loads the user's profile from Firestore.
 *
 * The displayed balance is (legacy users/{uid}.eigenCredits) + (sum of
 * users/{uid}/creditShards). Legacy field exists for customers created
 * before the 2026-06-03 sharding rollout; new writes only go to shards.
 * The two sources are summed so no migration step is required and
 * pre-sharding balances are preserved exactly.
 *
 * Uses Admin SDK — bypasses security rules.
 *
 * See lib/credit-shards.ts and FAANG-Analysis.txt 2026-06-03 entry
 * "Credit sharding" for the design.
 */
export async function getUserProfile(userId: string): Promise<{ eigenCredits: number }> {
  if (!userId) return { eigenCredits: 0 };
  const db = getAdminDb();
  const userRef = db.collection(USERS_COLLECTION).doc(userId);

  // Parallelize: legacy field read (1 doc) + shard sum (CREDIT_SHARD_COUNT
  // docs). Both go to Firestore independently; no reason to serialize.
  const [userSnap, shardedTotal] = await Promise.all([
    userRef.get(),
    readShardedCreditTotal(userId, db),
  ]);
  const data = userSnap.data();
  const legacy = typeof data?.eigenCredits === "number" ? data.eigenCredits : 0;

  return { eigenCredits: legacy + shardedTotal };
}

/**
 * Atomically update a user's EigenCredits by delta.
 *
 * Writes to a random shard via the sharded counter pattern — same
 * write-contention story as applyCreditMutation in lib/credit-ledger.ts.
 * Prefer applyCreditMutation for any operation that should be idempotent
 * across retries (it dedupes on opId); use this helper only for one-off
 * admin adjustments where idempotency is the caller's concern.
 *
 * Uses Admin SDK — bypasses security rules.
 */
export async function updateUserEigenCredits(userId: string, delta: number): Promise<void> {
  if (!userId) return;
  const shardRef = pickCreditShardRef(userId);
  await shardRef.set(
    {
      value: FieldValue.increment(delta),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
