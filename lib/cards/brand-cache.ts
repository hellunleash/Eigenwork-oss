// ---------------------------------------------------------------------------
// lib/cards/brand-cache.ts — passive employer → brand-bucket cache (ADR-007 §6)
// ---------------------------------------------------------------------------
// The cache grows on its own: every successful evaluation surfaces a
// work_history list with model-emitted brand_bucket on each entry, and we
// upsert each (employer, bucket) pair. First-write-wins for classifier:"model"
// so the same employer doesn't flip between runs. classifier:"manual" entries
// (the seed list + any hand-fixes) are sticky and never overwritten.
//
// Reads happen only from the deterministic fallback path (when the model's
// emitted title is missing or jargon-tainted). In the happy path, the model's
// inline brand_bucket on each work_history entry is used directly and no
// Firestore read is needed.

import { getAdminDb, FieldValue } from "@/lib/firebase-admin";

export const BRAND_CACHE_COLLECTION = "brand_cache";

export type BrandBucket = "FAANG" | "YC" | "tier-1";

export type BrandCacheEntry = {
  employer: string;
  bucket: BrandBucket;
  classifier: "model" | "manual";
  first_seen_candidate?: string;
  seen_count: number;
};

// Collapse common employer-name variants ("Google", "Google LLC", "google inc.")
// to the same document id. Alphanumerics only, lowercase, no whitespace.
export function normalizeEmployer(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

export async function readBrandCache(
  employer: string
): Promise<{ bucket: BrandBucket; classifier: "model" | "manual" } | null> {
  const id = normalizeEmployer(employer);
  if (!id) return null;
  try {
    const snap = await getAdminDb().collection(BRAND_CACHE_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<BrandCacheEntry> | undefined;
    const bucket = data?.bucket;
    if (bucket !== "FAANG" && bucket !== "YC" && bucket !== "tier-1") return null;
    const classifier = data?.classifier === "manual" ? "manual" : "model";
    return { bucket, classifier };
  } catch {
    return null;
  }
}

// First-write-wins for model classifications; manual entries are immutable.
// seen_count is incremented on every call regardless so the cache surfaces
// which employers are showing up in real candidate flow.
export async function upsertBrandCache(
  employer: string,
  bucket: BrandBucket,
  opts: { firstSeenCandidate?: string } = {}
): Promise<void> {
  const id = normalizeEmployer(employer);
  if (!id) return;
  try {
    const ref = getAdminDb().collection(BRAND_CACHE_COLLECTION).doc(id);
    await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          employer,
          bucket,
          classifier: "model" as const,
          classified_at: FieldValue.serverTimestamp(),
          seen_count: 1,
          ...(opts.firstSeenCandidate ? { first_seen_candidate: opts.firstSeenCandidate } : {}),
        });
        return;
      }
      // Existing entry: never overwrite the bucket label (first-write-wins,
      // manual entries are sticky). Just bump seen_count for telemetry.
      tx.update(ref, { seen_count: FieldValue.increment(1) });
    });
  } catch {
    // Cache writes are fire-and-forget telemetry. The evaluation must not
    // fail because Firestore had a hiccup writing the cache.
  }
}

// Batch-friendly variant: upserts all entries in parallel. Used by
// runEvaluation right after assembleCardPayload (Phase 4). Never throws.
export async function upsertBrandCacheBatch(
  entries: { employer: string; bucket: BrandBucket }[],
  opts: { firstSeenCandidate?: string } = {}
): Promise<void> {
  await Promise.allSettled(
    entries.map((e) => upsertBrandCache(e.employer, e.bucket, opts))
  );
}
