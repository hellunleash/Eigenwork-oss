import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Per-org daily chat budget (ADR-010 guardrail 3).
 *
 * A hard ceiling on bot messages per org per UTC day, kept in a separate counter
 * from `screensUsed` so a chatty customer can't quietly eat scoring margin. The
 * counter doc is keyed by org + day and resets implicitly at 00:00 UTC (a new
 * key). Atomic via a transaction so concurrent messages can't overshoot.
 */
const DAILY_CHAT_CAP = Number(process.env.AGENT_DAILY_CHAT_CAP ?? "200");

function todayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export type BudgetResult = { allowed: boolean; count: number; cap: number };

export async function consumeChatBudget(orgId: string): Promise<BudgetResult> {
  const db = getAdminDb();
  const day = todayKeyUTC();
  const ref = db.collection("agent_budgets").doc(`${orgId}_${day}`);
  const cap = DAILY_CHAT_CAP;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = typeof snap.data()?.count === "number" ? (snap.data()!.count as number) : 0;
    if (current >= cap) return { allowed: false, count: current, cap };
    tx.set(
      ref,
      { count: current + 1, orgId, day, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { allowed: true, count: current + 1, cap };
  });
}
