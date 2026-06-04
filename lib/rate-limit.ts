import { createHash } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Simple Firestore-backed rate limiter for public endpoints.
 * Not as fast as Redis, but works across instances and prevents abuse.
 */
const COLLECTION = "rateLimits";

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function allowRequest(args: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number; resetAtMs: number }> {
  const { key, limit, windowSeconds } = args;
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const resetAtMs = windowStart + windowSeconds * 1000;

  const id = `${hashKey(key)}_${windowStart}`;
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
    const next = count + 1;
    if (next > limit) {
      return { allowed: false as const, count };
    }
    tx.set(
      ref,
      {
        key,
        windowStartMs: windowStart,
        windowSeconds,
        count: FieldValue.increment(1),
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(resetAtMs + 5 * 60 * 1000), // for TTL cleanup if configured
      },
      { merge: true }
    );
    return { allowed: true as const, count: next };
  });

  const remaining = Math.max(0, limit - result.count);
  return { allowed: result.allowed, remaining, resetAtMs };
}

