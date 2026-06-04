import type { EtiDistribution } from "@/lib/eti-distribution";
export type SeniorityCluster = "junior" | "mid_plus";

const JUNIOR_SENIORITIES = new Set(["intern", "junior", ""]);

export function seniorityToCluster(seniority: string | undefined | null): SeniorityCluster {
  const s = (seniority ?? "").trim().toLowerCase();
  return JUNIOR_SENIORITIES.has(s) ? "junior" : "mid_plus";
}

export type WeakPoolResult =
  | { weak: false }
  | { weak: true; pctBelowThreshold: number; threshold: number; cluster: SeniorityCluster };

/**
 * Returns whether the candidate pool is weak.
 *   - Pool < 20 total → never weak (not enough data).
 *   - Junior/intern: weak if >60% of candidates have ETI <50.
 *   - Mid+: weak if >50% of candidates have ETI <65.
 */
export function detectWeakPool(
  dist: EtiDistribution,
  cluster: SeniorityCluster,
): WeakPoolResult {
  const { buckets, total } = dist;
  if (total < 20) return { weak: false };

  if (cluster === "junior") {
    const belowCount = buckets[0]?.count ?? 0;
    const aboveCount = total - belowCount;
    if (aboveCount >= 100) return { weak: false };
    const pct = (belowCount / total) * 100;
    if (pct > 60) return { weak: true, pctBelowThreshold: Math.round(pct), threshold: 50, cluster };
    return { weak: false };
  }

  const below65Count = (buckets[1]?.count ?? 0);
  const aboveCount = total - below65Count;
  if (aboveCount >= 100) return { weak: false };
  const pct = (below65Count / total) * 100;
  if (pct > 50) return { weak: true, pctBelowThreshold: Math.round(pct), threshold: 65, cluster };
  return { weak: false };
}
