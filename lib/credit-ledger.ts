import { createHash } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

const PADDLE_PROCESSED_COLLECTION = "processedPaddleTransactions";

export function makeOpId(parts: Record<string, string | number | null | undefined>): string {
  const stable = JSON.stringify(parts);
  return createHash("sha256").update(stable).digest("hex");
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
