/**
 * Concurrency-limited map. Returns PromiseSettledResult[] so successful items
 * complete their side effects (e.g. cache writes) before any rejection surfaces.
 *
 * Extracted (ADR-010 Phase 0) so the match core (lib/match.ts) and the worker's
 * cascade-delete handler share ONE implementation instead of duplicating it.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  parallelism: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };

  const lanes = Math.max(1, Math.min(parallelism, items.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}
