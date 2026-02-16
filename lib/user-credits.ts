import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

const USERS_COLLECTION = "users";

/**
 * Loads the user's profile from Firestore.
 * Returns eigenCredits (default 0 if doc or field missing).
 * Uses Admin SDK — bypasses security rules.
 */
export async function getUserProfile(userId: string): Promise<{ eigenCredits: number }> {
  if (!userId) return { eigenCredits: 0 };
  const db = getAdminDb();
  const snap = await db.collection(USERS_COLLECTION).doc(userId).get();
  const data = snap.data();
  const eigenCredits = typeof data?.eigenCredits === "number" ? data.eigenCredits : 0;
  return { eigenCredits };
}

/**
 * Atomically update a user's EigenCredits by delta.
 * Uses FieldValue.increment so concurrent updates are safe.
 * Uses Admin SDK — bypasses security rules.
 */
export async function updateUserEigenCredits(userId: string, delta: number): Promise<void> {
  if (!userId) return;
  const db = getAdminDb();
  await db.collection(USERS_COLLECTION).doc(userId).set(
    { eigenCredits: FieldValue.increment(delta) },
    { merge: true }
  );
}
