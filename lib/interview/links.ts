/**
 * Candidate interview link helper (Phase 2). One place that builds the tokenized
 * per-round candidate URL, reused by the Slack invite-confirm handler (and anywhere
 * else that hands a candidate their link) so the path scheme isn't forked. Mirrors
 * lib/agent/intake.ts's intakeLink (same APP_URL base).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export type InterviewRoundKey = "screen" | "takeHome" | "systemDesign";

const ROUND_PATH: Record<InterviewRoundKey, string> = {
  screen: "",
  takeHome: "/takehome",
  systemDesign: "/systemdesign",
};

export const ROUND_LABEL: Record<InterviewRoundKey, string> = {
  screen: "technical screen",
  takeHome: "take-home",
  systemDesign: "system design",
};

export function isInterviewRoundKey(v: unknown): v is InterviewRoundKey {
  return v === "screen" || v === "takeHome" || v === "systemDesign";
}

/** The tokenized candidate URL for a given round. */
export function interviewLink(candidateId: string, round: InterviewRoundKey, token: string): string {
  return `${APP_URL}/interview/${encodeURIComponent(candidateId)}${ROUND_PATH[round]}?t=${encodeURIComponent(token)}`;
}
