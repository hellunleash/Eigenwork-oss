import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Slack event idempotency (ADR-010 hardening). Slack's Events API is at-least-once:
 * the same event_id can be delivered more than once (beyond the explicit retries we
 * already drop via x-slack-retry-num). Without a guard, a duplicate would re-run the
 * agent (double Gemini spend) and double-post.
 *
 * `claimSlackEvent` does an atomic create on `slack_events/{event_id}` — the first
 * caller wins (returns true), any duplicate hits ALREADY_EXISTS (returns false).
 * Missing event_id => allow (can't dedupe, don't block). Docs carry `createdAt`
 * so a TTL policy can reap them later; the collection is otherwise write-once.
 */
export async function claimSlackEvent(eventId: string | null | undefined): Promise<boolean> {
  if (!eventId) return true;
  try {
    await getAdminDb()
      .collection("slack_events")
      .doc(eventId)
      .create({ createdAt: FieldValue.serverTimestamp() });
    return true;
  } catch {
    // create() throws if the doc already exists -> already processed.
    return false;
  }
}
