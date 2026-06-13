// Card-field validators (CPU only — no Firestore, no LLM).
//
// Used by assembleCardPayload to decide whether the model's emitted title /
// edge / flag strings are usable or should be replaced by the deterministic
// fallback. Two rules: empty/whitespace strings fail, and any internal-rubric
// token (ESQ / PDQ / NR / OM / OD / PC / rubric / block / justification)
// inside a recruiter-facing field is treated as a jargon leak and fails.

// Source of truth for the banned-token list (ADR-007 §8). Mirrored verbatim
// in scripts/migrate-legacy-cards.mjs so the legacy edge derivation strips
// the same prefixes.
//
// Word boundaries are REQUIRED: without \b, the two-letter labels (OM / OD
// / PC / NR) match as substrings inside ordinary English ("compliance" has
// "om", "code" has "od", "earner" has "nr", "specific" has "pc"), causing
// every recruiter-friendly edge to be falsely rejected and the fallback to
// fire on a downstream block justification. Pluralized forms covered for
// "rubrics" / "blocks" / "justifications" so common plurals don't slip past.
export const BANNED_TOKEN_RE = /\b(ESQ|PDQ|NR|OM|OD|PC|rubrics?|blocks?|justifications?)\b/i;

export function isUsefulString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function containsBannedTokens(s: string): boolean {
  return BANNED_TOKEN_RE.test(s);
}

// Returns the trimmed field if it's a usable, jargon-free string; null
// otherwise. The fallback path keys off null.
export function validateCardField(v: unknown): string | null {
  if (!isUsefulString(v)) return null;
  const trimmed = v.trim();
  if (containsBannedTokens(trimmed)) return null;
  return trimmed;
}
