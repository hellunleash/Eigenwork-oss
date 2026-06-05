/**
 * Plan / pass specifications — pure constants with no runtime dependencies, so
 * both lib/org.ts and lib/entitlements.ts can import them without an import
 * cycle. Single source of truth for tier caps (ADR-002).
 */
export type PassKind = "free" | "single_role" | "team";

export interface PassSpec {
  /** Bundled Candidate Screens included with the pass. */
  screenCap: number;
  /** Max concurrent active roles (open JDs). */
  roleLimit: number;
  /** Whether the pass unlocks ATS push (Team). */
  atsEnabled: boolean;
  /** Validity window in days from grant; null = never expires (Free). */
  validityDays: number | null;
}

export const PASS_SPEC: Record<PassKind, PassSpec> = {
  free: { screenCap: 100, roleLimit: 1, atsEnabled: false, validityDays: null },
  single_role: { screenCap: 1500, roleLimit: 1, atsEnabled: false, validityDays: 60 },
  team: { screenCap: 15000, roleLimit: 10, atsEnabled: true, validityDays: 180 },
};

/**
 * Shards per counter (screen usage + overage wallet). Mirrors
 * CREDIT_SHARD_COUNT in lib/credit-shards.ts: ~N sustained writes/sec so a
 * 10k-applicant burst (ADR-001) cannot serialize on one doc.
 */
export const SCREEN_SHARD_COUNT = 10;

export const MS_PER_DAY = 86_400_000;
