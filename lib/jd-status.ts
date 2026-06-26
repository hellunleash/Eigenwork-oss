/**
 * Canonical role (pipeline) status — SINGLE SOURCE OF TRUTH. The dashboard's
 * "Pipeline health" rows and the Slack bot's roles answers both derive status
 * from this one function, so "Filling / Ready / Closed" means the same thing on
 * both surfaces. The thresholds (0.6 = shortlisting unlock) live here only.
 */
export type RoleStatus = "open" | "awaiting" | "ready" | "closed";

/** Recruiter-facing label per status. "awaiting" reads as "Filling". */
export const ROLE_STATUS_LABEL: Record<RoleStatus, string> = {
  open: "Open",
  awaiting: "Filling",
  ready: "Ready",
  closed: "Closed",
};

export function deriveRoleStatus(p: {
  isClosed: boolean;
  hasMatchResult?: boolean;
  submissionCap: number;
  appliedCount: number;
}): RoleStatus {
  if (p.isClosed || p.hasMatchResult) return "closed";
  const ratio = p.submissionCap > 0 ? p.appliedCount / p.submissionCap : 0;
  if (ratio >= 0.6) return "ready";
  if (p.appliedCount > 0) return "awaiting";
  return "open";
}
