/**
 * Sharded counter pattern for the user credit balance.
 *
 * Firestore single-document writes are bounded at ~1/second sustained.
 * When a customer evaluates many candidates in a short window (e.g. a
 * viral intake link drawing 50 submissions in a minute), every evaluation
 * tries to increment users/{uid}.eigenCredits via the credit ledger,
 * serializing through that one doc. Worker latency goes from ~40s to
 * 70-90s under that burst.
 *
 * Sharding the balance across N sub-docs raises the sustained write
 * ceiling to ~N/second with no coordination required: each write picks
 * a random shard, reads sum the shards.
 *
 * Backward compatibility:
 *   - Legacy customers have users/{uid}.eigenCredits populated by the
 *     pre-sharding ledger. That field is no longer written but is still
 *     read; the displayed balance is (legacy + sum-of-shards).
 *   - No migration is required. Empty shard subcollection sums to 0,
 *     legacy field carries the entire pre-sharding balance, total is
 *     identical to what it was before. The first write after deploy
 *     creates the first shard doc lazily.
 *
 * See FAANG-Analysis.txt 2026-06-03 entry "Credit sharding".
 */
import { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

/** Number of shards per user. 10 is the conventional sweet spot:
 *  - ~10 sustained writes/sec without contention
 *  - 10-doc read fanout on balance reads (cheap)
 *  - Worst-case 100-candidate burst drains in ~10s instead of ~100s */
export const CREDIT_SHARD_COUNT = 10;

const USERS_COLLECTION = "users";
const SHARDS_SUBCOLLECTION = "creditShards";

/** Random shard index in [0, CREDIT_SHARD_COUNT). */
function randomShardId(): number {
  return Math.floor(Math.random() * CREDIT_SHARD_COUNT);
}

/** Get a doc ref to a randomly chosen shard for the user.
 *  Callers use this for increment-style writes. */
export function pickCreditShardRef(userId: string, db?: Firestore) {
  const adminDb = db ?? getAdminDb();
  const shardId = randomShardId();
  return adminDb
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(SHARDS_SUBCOLLECTION)
    .doc(String(shardId));
}

/** Read every shard and sum the `value` field. Returns 0 if no shards exist
 *  (which is the case for legacy users until their first sharded write). */
export async function readShardedCreditTotal(userId: string, db?: Firestore): Promise<number> {
  if (!userId) return 0;
  const adminDb = db ?? getAdminDb();
  const snaps = await adminDb
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(SHARDS_SUBCOLLECTION)
    .get();
  let total = 0;
  for (const doc of snaps.docs) {
    const v = (doc.data() ?? {}).value;
    if (typeof v === "number" && Number.isFinite(v)) {
      total += v;
    }
  }
  return total;
}
