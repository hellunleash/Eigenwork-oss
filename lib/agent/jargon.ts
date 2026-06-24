import { BANNED_TOKEN_RE, containsBannedTokens } from "@/lib/cards/validate";

/**
 * Jargon guard for agent output (ADR-010 guardrail 7). Reuses the ADR-007
 * banned-token list so the bot never leaks internal scoring acronyms
 * (ESQ/PDQ/NR/blocks/rubric/justifications) into a recruiter-facing reply.
 */
export function hasJargon(s: string): boolean {
  return containsBannedTokens(s);
}

/** Last-resort scrub: strip leaked tokens and tidy spacing. The judge should
 *  catch jargon first and trigger a safe fallback; this is the final net. */
export function scrubJargon(s: string): string {
  return s
    .replace(new RegExp(BANNED_TOKEN_RE.source, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}
