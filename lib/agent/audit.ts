import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

/**
 * Agent audit log (ADR-010). Every request, tool call, and proposed action is
 * persisted to `agent_runs/{id}` with the resolving uid as actor — the debugging
 * trail AND the compliance artifact (the "Audit Export" that underwrites the
 * NYC LL144 assistive-tool posture). Conditional spreads keep undefined out of
 * Firestore.
 */
export type AgentRunInput = {
  orgId: string;
  userId: string;
  surface: "slack";
  kind: "message" | "tool_call" | "action";
  teamId?: string;
  channel?: string;
  slackUserId?: string;
  text?: string;
  detail?: Record<string, unknown>;
};

export async function logAgentRun(input: AgentRunInput): Promise<string> {
  const db = getAdminDb();
  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    userId: input.userId,
    surface: input.surface,
    kind: input.kind,
    createdAt: FieldValue.serverTimestamp(),
    ...(input.teamId != null && { teamId: input.teamId }),
    ...(input.channel != null && { channel: input.channel }),
    ...(input.slackUserId != null && { slackUserId: input.slackUserId }),
    ...(input.text != null && { text: input.text }),
    ...(input.detail != null && { detail: input.detail }),
  };
  const ref = await db.collection("agent_runs").add(doc);
  return ref.id;
}
