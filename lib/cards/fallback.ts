// ---------------------------------------------------------------------------
// lib/cards/fallback.ts — per-slot deterministic fallback for the card
// ---------------------------------------------------------------------------
// When the model's emitted title / edge / flag field is missing, empty, or
// contains an internal-rubric token (per validateCardField), the runner
// substitutes the corresponding fallback so the card always renders.
// Each fallback reads only ALREADY-PERSISTED inputs (sub-scores, overlord
// verdict, github_metrics, work_history, brand_cache) — never the model
// output it is replacing. See ADR-007 §8.

import { readBrandCache, type BrandBucket } from "@/lib/cards/brand-cache";
import { containsBannedTokens, isUsefulString, validateCardField } from "@/lib/cards/validate";

// Minimal shape we read off the model's role_fit object. The full schema
// (with secondary/tertiary arrays) is owned by lib/eti/rubric-context.ts;
// this type only surfaces the two fields the fallback title needs.
export type RoleFitLike = {
  title?: string;
  primary?: string;
};

// One entry as emitted by the overlord block under rubric-overlord.ts. start
// and end are expected as "YYYY-MM" or "present"; we tolerate other shapes
// (returns 0 years for unparseable dates) so a malformed entry can't crash
// the whole assembly path.
export type WorkHistoryEntry = {
  employer?: string;
  title?: string;
  start?: string;
  end?: string;
  scope_one_liner?: string;
  brand_bucket?: BrandBucket | null;
};

// Per-block input used by fallbackEdge. label is the internal name (ESQ /
// PDQ / NR / OM / OD / PC) — the fallback selects by score and strips any
// label prefix so the returned string is recruiter-clean.
export type DecisionBlock = {
  label: string;
  score: number;
  justification: string;
};

// Minimal shape we read off the model's overlord object. Full structured
// verdict lives in lib/evaluation-runner.ts; we only need the trigger list.
export type OverlordLike = {
  triggered?: Array<{ id?: string; reason?: string } | null>;
};

// Subset of GithubSignalMetrics needed by the flag fallback. Keeping a local
// type rather than importing the full metrics type avoids dragging the
// 30-field shape into a CPU-only module.
export type GithubFlagMetrics = {
  all_in_one_day?: boolean;
  commits_analyzed?: number;
};

// ---------------------------------------------------------------------------
// Date math (tolerant — unparseable inputs return 0 years rather than throw)
// ---------------------------------------------------------------------------

function parseYearMonth(s: string | undefined | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const lower = s.trim().toLowerCase();
  if (lower === "present" || lower === "current" || lower === "now") return new Date();
  const m = s.match(/^(\d{4})[-/]?(\d{1,2})?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) - 1 : 0;
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  if (month < 0 || month > 11) return null;
  return new Date(year, month, 1);
}

function yearsAtEntry(entry: WorkHistoryEntry): number {
  const start = parseYearMonth(entry.start);
  const end = parseYearMonth(entry.end) ?? new Date();
  if (!start || end < start) return 0;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months / 12);
}

// FAANG > tier-1 > YC. The model and the fallback use the same priority so
// the cached and freshly-emitted paths agree on which entry wins the chip.
function bucketPriority(b: BrandBucket): number {
  return b === "FAANG" ? 3 : b === "tier-1" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Title fallback — async because it may hit brand_cache for entries whose
// inline brand_bucket was missing. Reader is injectable for unit tests.
// ---------------------------------------------------------------------------

async function defaultReadBucket(employer: string): Promise<BrandBucket | null> {
  const result = await readBrandCache(employer);
  return result?.bucket ?? null;
}

export async function fallbackTitle(
  roleFit: RoleFitLike | undefined | null,
  workHistory: WorkHistoryEntry[] | undefined | null,
  readBucket: (employer: string) => Promise<BrandBucket | null> = defaultReadBucket
): Promise<string> {
  const title = (roleFit?.title ?? "").trim();
  const primary = (roleFit?.primary ?? "").trim();

  if (Array.isArray(workHistory) && workHistory.length > 0 && title) {
    const candidates: { bucket: BrandBucket; years: number }[] = [];
    for (const entry of workHistory) {
      if (!entry || !entry.employer) continue;
      let bucket: BrandBucket | null = null;
      const inline = entry.brand_bucket;
      if (inline === "FAANG" || inline === "YC" || inline === "tier-1") {
        bucket = inline;
      } else if (inline === null || inline === undefined) {
        bucket = await readBucket(entry.employer);
      }
      if (bucket) {
        candidates.push({ bucket, years: yearsAtEntry(entry) });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const dp = bucketPriority(b.bucket) - bucketPriority(a.bucket);
        if (dp !== 0) return dp;
        return b.years - a.years;
      });
      const winner = candidates[0];
      const yrs = Math.round(winner.years);
      if (yrs >= 1) {
        const label = yrs === 1 ? "1 yr" : `${yrs} yrs`;
        return `${label} at ${winner.bucket} · ${title}`;
      }
    }
  }

  if (title && primary) return `${title} (${primary})`;
  return title || "Candidate";
}

// ---------------------------------------------------------------------------
// Edge fallback — pick the highest-scoring block with a jargon-free
// justification, return it verbatim with no label prefix.
// ---------------------------------------------------------------------------

export function fallbackEdge(blocks: DecisionBlock[]): string {
  if (!Array.isArray(blocks)) return "";
  const usable = blocks.filter(
    (b) => b && isUsefulString(b.justification) && !containsBannedTokens(b.justification)
  );
  if (usable.length === 0) return "";
  const top = usable.reduce((best, b) => (b.score > best.score ? b : best));
  return top.justification.trim();
}

// ---------------------------------------------------------------------------
// Flag fallback — overlord first, then junior-only GitHub all_in_one_day.
// Senior never has github_metrics, so only the overlord rule fires there.
// ---------------------------------------------------------------------------

export function fallbackFlag(
  overlord: OverlordLike | null | undefined,
  githubMetrics: GithubFlagMetrics | null | undefined,
  track: "junior" | "senior"
): string | null {
  const triggered = overlord?.triggered;
  if (Array.isArray(triggered)) {
    for (const t of triggered) {
      const reason = t?.reason;
      if (isUsefulString(reason)) return reason.trim();
    }
  }
  if (track === "junior" && githubMetrics?.all_in_one_day) {
    return "Whole repo committed in one day — looks staged";
  }
  return null;
}

// ---------------------------------------------------------------------------
// One-call assembly — validate each model field, fall back per-slot.
// Returns the locked Card shape with no nulls except flag.
// ---------------------------------------------------------------------------

export type Card = {
  title: string;
  edge: string;
  flag: string | null;
};

export type AssembleCardInput = {
  modelTitle: unknown;
  modelEdge: unknown;
  modelFlag: unknown;
  roleFit?: RoleFitLike | null;
  workHistory?: WorkHistoryEntry[] | null;
  blocks: DecisionBlock[];
  overlord?: OverlordLike | null;
  githubMetrics?: GithubFlagMetrics | null;
  track: "junior" | "senior";
  readBucket?: (employer: string) => Promise<BrandBucket | null>;
};

export async function assembleCardPayload(input: AssembleCardInput): Promise<Card> {
  const title =
    validateCardField(input.modelTitle) ??
    (await fallbackTitle(input.roleFit ?? undefined, input.workHistory ?? undefined, input.readBucket));
  const edge = validateCardField(input.modelEdge) ?? fallbackEdge(input.blocks);
  const flag =
    validateCardField(input.modelFlag) ??
    fallbackFlag(input.overlord ?? null, input.githubMetrics ?? null, input.track);
  return { title, edge, flag };
}
