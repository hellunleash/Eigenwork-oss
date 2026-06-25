import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Short conversational memory for the agent (ADR-010 — follow-up resolution).
 *
 * The agent is otherwise stateless: each message is routed against only the
 * current text + roster, so anaphora ("both", "they", "the first one", "him",
 * "that candidate") can't resolve and the router bails to `clarify`. We keep a
 * tiny rolling transcript per conversation (DM channel, or the thread root for a
 * channel thread) in `agent_threads/{key}` and feed it into the router so a
 * follow-up resolves against what was just said. Memory is best-effort — a load
 * or save failure degrades to the old stateless behavior, never blocks a reply.
 *
 * `ids` on a turn = the candidate ids that were in play (listed or resolved) so
 * the next turn can map "both"/"them" straight onto real ids.
 */
export type ConvoTurn = { role: "user" | "bot"; text: string; ids?: string[] };

const MAX_TURNS = 8; // ~4 exchanges — enough for follow-ups, bounded prompt cost.
const COLLECTION = "agent_threads";

function docId(key: string): string {
  // Firestore doc ids can't contain "/"; Slack ids never do, but be safe.
  return key.replace(/\//g, "_").slice(0, 1400);
}

export async function loadConvo(key: string): Promise<ConvoTurn[]> {
  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(docId(key)).get();
    const turns = snap.data()?.turns;
    return Array.isArray(turns) ? (turns as ConvoTurn[]) : [];
  } catch {
    return [];
  }
}

export async function saveTurn(key: string, userTurn: ConvoTurn, botTurn: ConvoTurn): Promise<void> {
  try {
    const ref = getAdminDb().collection(COLLECTION).doc(docId(key));
    const existing = await loadConvo(key);
    const turns = [...existing, userTurn, botTurn].slice(-MAX_TURNS);
    await ref.set({ turns, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Pending intake draft (create_intake confirm-and-fill flow). A create_intake
 * proposes a draft JD and parks it here keyed by conversation; subsequent replies
 * edit it or confirm it. Stored on the same agent_threads doc as `pendingIntake`.
 */
export type PendingIntake = Record<string, unknown>;

export async function loadPendingIntake(key: string): Promise<PendingIntake | null> {
  try {
    const snap = await getAdminDb().collection(COLLECTION).doc(docId(key)).get();
    const p = snap.data()?.pendingIntake;
    return p && typeof p === "object" ? (p as PendingIntake) : null;
  } catch {
    return null;
  }
}

export async function savePendingIntake(key: string, fields: PendingIntake): Promise<void> {
  try {
    await getAdminDb()
      .collection(COLLECTION)
      .doc(docId(key))
      .set({ pendingIntake: fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch {
    /* best-effort */
  }
}

export async function clearPendingIntake(key: string): Promise<void> {
  try {
    await getAdminDb()
      .collection(COLLECTION)
      .doc(docId(key))
      .set({ pendingIntake: FieldValue.delete() }, { merge: true });
  } catch {
    /* best-effort */
  }
}
