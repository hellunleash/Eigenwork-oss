import { createHash } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

const COLLECTION = "roleFitCache";
const TTL_DAYS = 7;

function keyToId(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function expiresAtDate() {
  return new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function getRoleFitCachedLabel(key: string): Promise<string | null> {
  const id = keyToId(key);
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as { label?: unknown; expiresAt?: { toDate?: () => Date } } | undefined;
  const label = typeof data?.label === "string" ? data.label : null;
  const exp = data?.expiresAt && typeof data.expiresAt === "object" && "toDate" in data.expiresAt
    ? (data.expiresAt as { toDate: () => Date }).toDate()
    : null;
  if (exp && exp.getTime() < Date.now()) return null;
  return label;
}

export async function setRoleFitCachedLabel(key: string, label: string): Promise<void> {
  const id = keyToId(key);
  const db = getAdminDb();
  await db
    .collection(COLLECTION)
    .doc(id)
    .set(
      {
        key,
        label,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expiresAtDate(),
      },
      { merge: true }
    );
}

// Firestore Admin SDK getAll / batch.commit are bounded per-call. 400 stays
// safely under the documented limit while minimizing round trips.
const BATCH_LOOKUP_SIZE = 400;
const BATCH_WRITE_SIZE = 400;

/**
 * Batched cache lookup. Returns a parallel array of labels (null = miss).
 * Collapses N point reads into ceil(N / 400) Firestore round trips.
 */
export async function getRoleFitCachedLabelsBatch(keys: string[]): Promise<(string | null)[]> {
  if (keys.length === 0) return [];
  const db = getAdminDb();
  const refs = keys.map((k) => db.collection(COLLECTION).doc(keyToId(k)));
  const out: (string | null)[] = new Array(keys.length).fill(null);
  const nowMs = Date.now();

  for (let i = 0; i < refs.length; i += BATCH_LOOKUP_SIZE) {
    const slice = refs.slice(i, i + BATCH_LOOKUP_SIZE);
    const snaps = await db.getAll(...slice);
    for (let j = 0; j < snaps.length; j++) {
      const snap = snaps[j];
      if (!snap.exists) continue;
      const data = snap.data() as { label?: unknown; expiresAt?: { toDate?: () => Date } } | undefined;
      const label = typeof data?.label === "string" ? data.label : null;
      if (!label) continue;
      const exp =
        data?.expiresAt && typeof data.expiresAt === "object" && "toDate" in data.expiresAt
          ? (data.expiresAt as { toDate: () => Date }).toDate()
          : null;
      if (exp && exp.getTime() < nowMs) continue;
      out[i + j] = label;
    }
  }
  return out;
}

/**
 * Batched cache write. Fire-and-forget callers should still handle rejection.
 * Splits into Firestore batched writes of <=400 entries each.
 */
export async function setRoleFitCachedLabelsBatch(
  entries: { key: string; label: string }[]
): Promise<void> {
  if (entries.length === 0) return;
  const db = getAdminDb();
  for (let i = 0; i < entries.length; i += BATCH_WRITE_SIZE) {
    const slice = entries.slice(i, i + BATCH_WRITE_SIZE);
    const batch = db.batch();
    for (const { key, label } of slice) {
      const ref = db.collection(COLLECTION).doc(keyToId(key));
      batch.set(
        ref,
        {
          key,
          label,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: expiresAtDate(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

