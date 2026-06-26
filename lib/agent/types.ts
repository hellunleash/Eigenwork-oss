/**
 * Shared agent turn types (ADR-010 / ADR-012). Extracted into their own module so
 * both the router path (`loop.ts`) and the tool-calling path (`tool-loop.ts`) can
 * import them without a circular dependency (loop.ts dispatches into tool-loop.ts).
 */

export type AgentTurnParams = {
  orgId: string;
  userId: string;
  text: string;
  teamId?: string;
  channel?: string;
  slackUserId?: string;
  /** Conversation key (DM channel or thread root). When set, the turn loads +
   *  persists short rolling memory so follow-ups ("both", "the first one") resolve. */
  convoKey?: string;
};

/** A reply may be plain text or carry Slack Block Kit (e.g. a move_stage or
 *  run_match confirm). The events route posts both. */
export type AgentReply = { text: string; blocks?: unknown[] };

/** The audit context a write-path mint/move needs for `logAgentRun`, without
 *  pulling in the whole turn params. */
export type AuditMeta = { teamId?: string; channel?: string; slackUserId?: string };
