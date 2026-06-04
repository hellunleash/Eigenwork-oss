export type EtiBucket = { min: number; max: number; count: number };

export type EtiDistribution = { buckets: EtiBucket[]; total: number };

/** Four bands: under 50, 50–64, 65–79, 80+ (half-open on upper bound except last). */
function etiBucketIndex(s: number): number {
  if (s < 50) return 0;
  if (s < 65) return 1;
  if (s < 80) return 2;
  return 3;
}

const BUCKET_DEFS: readonly { min: number; max: number }[] = [
  { min: 0, max: 49 },
  { min: 50, max: 64 },
  { min: 65, max: 79 },
  { min: 80, max: 100 },
] as const;

/** Whole pool, including not_matchable / ETI under 50. */
export function buildEtiDistributionFromScores(scores: number[]): EtiDistribution {
  const counts = [0, 0, 0, 0];
  for (const raw of scores) {
    const s = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    counts[etiBucketIndex(s)]++;
  }
  const buckets: EtiBucket[] = counts.map((count, i) => ({
    ...BUCKET_DEFS[i],
    count,
  }));
  return { buckets, total: scores.length };
}

/**
 * Full 0–100 reference scale (red → yellow → green → teal). Used where a single continuous strip is needed.
 */
export const ETI_SCALE_LINEAR_GRADIENT =
  "linear-gradient(to right, " +
  "#fef2f2 0%, #fee2e2 25%, #fecaca 40%, #fca5a5 50%, " +
  "#fef9c3 50%, #fef08a 57%, #facc15 65%, " +
  "#dcfce7 65%, #bbf7d0 72%, #4ade80 80%, " +
  "#ccfbf1 80%, #5eead4 90%, #0d9488 100%)";

/**
 * Per-bucket fills for distribution segments (avoids clipping bugs and flat single-color bars).
 * Aligns with Low / Medium / High / Very High trust colors on results cards.
 */
export const ETI_BUCKET_SEGMENT_GRADIENTS = [
  "linear-gradient(to right, #fecaca 0%, #f87171 50%, #dc2626 100%)",
  "linear-gradient(to right, #fde68a 0%, #facc15 50%, #ca8a04 100%)",
  "linear-gradient(to right, #86efac 0%, #4ade80 50%, #16a34a 100%)",
  "linear-gradient(to right, #5eead4 0%, #2dd4bf 50%, #0f766e 100%)",
] as const;

export function etiBucketSegmentGradient(bucketIndex: number): string {
  return ETI_BUCKET_SEGMENT_GRADIENTS[bucketIndex] ?? ETI_BUCKET_SEGMENT_GRADIENTS[0];
}

/** ETI value at the start of each band (for tick labels at segment boundaries). */
export const ETI_AXIS_BAND_START = [0, 50, 65, 80] as const;

/**
 * Flex-grow weights for bar columns: applicant count plus a floor so empty bands stay visible
 * but take less space when the pool piles into other bands.
 */
export function etiBandFlexWeights(dist: EtiDistribution): number[] {
  const { buckets, total } = dist;
  const floor = Math.max(0.5, total * 0.06);
  return buckets.map((b) => b.count + floor);
}

/** Short ETI range label for a bucket index (matches trust bands). */
export function etiBucketRangeLabel(bucketIndex: number): string {
  const labels = ["<50", "50–64", "65–79", "80+"] as const;
  return labels[bucketIndex] ?? "—";
}

