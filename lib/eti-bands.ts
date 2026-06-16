// ---------------------------------------------------------------------------
// lib/eti-bands.ts — calibrated per-level ETI band cutoffs (ADR-009)
// ---------------------------------------------------------------------------
// ETI is ROLE-RELATIVE: a junior at ETI 60 is exceptional for the role, a
// senior at ETI 60 is mediocre for the role. Same number, opposite meaning.
// So any cross-role aggregate must convert a raw score to a role-relative
// position before comparing. This module is the global (EigenWork-wide)
// per-level band table the ADR specifies, replacing the old fixed 80/65/50
// bands everywhere. Pure / CPU-only — no Firestore, no I/O.
//
// Cutoffs come from ADR-009 §"Calibrated per-level bands": junior "top tier"
// ≈ ETI 52, senior ≈ ETI 74. "strong" sits one band below "top"; anything
// under that is "below". Defaulting to GLOBAL cutoffs (stable from candidate
// #1); org-relative recompute is a later phase (ADR-009 open call).

export type EtiLevel = "Junior" | "Senior";
export type EtiBand = "top" | "strong" | "below";

type LevelCutoffs = { top: number; strong: number };

// score >= top   → "top"
// score >= strong→ "strong"
// else           → "below"
const BAND_CUTOFFS: Record<EtiLevel, LevelCutoffs> = {
  // Junior population skews low (P(ETI >= 65 | junior) ≈ 1%): top tier ≈ 52.
  Junior: { top: 52, strong: 40 },
  // Senior population skews higher against the senior rubric: top tier ≈ 74.
  Senior: { top: 74, strong: 60 },
};

/**
 * Role-relative band for a raw ETI score. Used so cross-role aggregates compare
 * "top junior" against "top senior" rather than raw numbers. Unknown / NaN
 * scores fall to "below" (a missing signal is never "top").
 */
export function bandForScore(score: number, level: EtiLevel): EtiBand {
  const cutoffs = BAND_CUTOFFS[level];
  if (!Number.isFinite(score)) return "below";
  if (score >= cutoffs.top) return "top";
  if (score >= cutoffs.strong) return "strong";
  return "below";
}
