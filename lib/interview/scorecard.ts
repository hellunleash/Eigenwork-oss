/**
 * Shared, PURE scorecard normalizer for EVERY auto-scored interview round
 * (screen / take-home / system design). One place for the clamp + deterministic
 * `suggestedAdvance` rule so no round forks it (reuse-never-fork). The model never
 * decides `suggestedAdvance` — it's computed from the threshold here, and it's a
 * recommendation only: advance/reject is always a human click (assistive posture).
 *
 * Pure (no Firestore/LLM) — unit-tested by scripts/qa-interview-foundation.ts.
 */
import type { Scorecard, ScorecardDimension } from "@/lib/interview/rounds";

export const DEFAULT_ADVANCE_THRESHOLD = 60;

/** Clamp any model-supplied number to an integer 0–100 (0 when non-finite). */
export function clamp100(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

/** Normalize a raw model scorecard into the canonical {@link Scorecard} shape. */
export function normalizeScorecard(json: Record<string, unknown>, advanceThreshold = DEFAULT_ADVANCE_THRESHOLD): Scorecard {
  const dims: ScorecardDimension[] = Array.isArray(json.dimensions)
    ? json.dimensions
        .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
        .map((d) => ({
          name: typeof d.name === "string" ? d.name : "dimension",
          score: clamp100(d.score),
          max: typeof d.max === "number" ? d.max : 100,
          note: typeof d.note === "string" ? d.note : "",
        }))
    : [];
  const overall = clamp100(json.overall);
  const flags = Array.isArray(json.flags) ? json.flags.filter((f): f is string => typeof f === "string") : undefined;
  return {
    overall,
    dimensions: dims,
    summary: typeof json.summary === "string" ? json.summary : "",
    suggestedAdvance: overall >= advanceThreshold,
    ...(flags && flags.length ? { flags } : {}),
  };
}
