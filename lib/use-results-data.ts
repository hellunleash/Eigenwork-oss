import useSWR from 'swr';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { buildEtiDistributionFromScores, type EtiDistribution } from '@/lib/eti-distribution';
import { getIdTokenOrNull } from '@/lib/auth-client';

type RoleFit = {
  one_liner?: string;
  title?: string;
  primary?: string[];
  secondary?: string[];
  tertiary?: string[];
};

// ADR-007: result card payload. Emitted by the v2 evaluation pipeline; absent
// on legacy docs until the migration script (scripts/migrate-legacy-cards.mjs)
// runs over them.
export type Card = {
  title: string;
  edge: string;
  flag: string | null;
};

// ADR-007: structured work_history entry. One per role parsed by the overlord
// step. brand_bucket drives the title's brand chip and is also written into
// brand_cache for analytics. Empty array is a valid value (no employment).
export type WorkHistoryEntry = {
  employer: string;
  title?: string;
  start?: string;
  end?: string;
  scope_one_liner?: string;
  brand_bucket?: 'FAANG' | 'YC' | 'tier-1' | null;
};

// Structural mirror of the fields the Signals panel renders from
// GithubSignalMetrics. Junior-only; senior docs never carry it.
export type GithubMetricsView = {
  total_files?: number;
  code_files?: number;
  dir_depth_max?: number;
  hardening_density?: number;
  commits_analyzed?: number;
  span_days?: number;
  authorship_share?: number;
  has_ci?: boolean;
  has_dockerfile?: boolean;
  has_routes?: boolean;
  has_migrations?: boolean;
  all_in_one_day?: boolean;
};

export type Candidate = {
  id: string;
  score: number;
  yoe?: number;
  profile?: {
    role_fit?: RoleFit | string;
  };
  role_fit?: RoleFit | string;
  // Evidence status from v2 scoring; may be absent on older docs.
  esq_status?: 'ok' | 'unavailable' | 'no_evidence';
  candidateName?: string;
  email?: string;
  phone?: string | null;
  matchData: {
    locations: string[];
    workTypes: string[];
    work_auth: string;
  };
  resume_url?: string;
  // ADR-007 fields. card is present on new v2 evaluations and on legacy
  // docs that have been through the migration script; github_metrics is
  // junior-only; work_history is present on both tracks.
  card?: Card;
  github_metrics?: GithubMetricsView;
  work_history?: WorkHistoryEntry[];
};

type MatchResultsResponse = {
  top10: Candidate[];
  etiDistribution?: EtiDistribution;
  seniority?: string;
  success?: boolean;
  error?: string;
};

// Fetcher function for SWR
const fetcher = async (url: string): Promise<MatchResultsResponse> => {
  const token = await getIdTokenOrNull();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    (error as unknown as { status?: number }).status = res.status;
    const data = await res.json().catch(() => ({}));
    (error as unknown as { message: string }).message = (data as { error?: string }).error ?? 'Failed to load results';
    throw error;
  }
  return res.json();
};

/**
 * Custom hook for fetching match results with stale-while-revalidate pattern.
 * 
 * Features:
 * - Fetches /api/jd/match?jobId=...
 * - Caches data per jobId
 * - Prevents duplicate requests
 * - Shows cached data immediately while revalidating in background
 * - Automatically revalidates on focus and interval
 * - Safe for Next.js SSR (client-side only)
 */
export function useResultsData(jobId: string | null) {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<MatchResultsResponse>(
    jobId ? `/api/jd/match?jobId=${encodeURIComponent(jobId)}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000, // Prevent duplicate requests within 2 seconds
      refreshInterval: 0, // Disable auto-refresh, rely on focus/reconnect
      onError: (error) => {
        console.error('Failed to fetch match results:', error);
      },
    }
  );

  // Invalidate this hook's cache on sign-out so a re-login (potentially as a
  // different user) doesn't render a previous session's results before the
  // server has had a chance to authorize. Matches the pattern in
  // useDashboardData. See lib/swr-config.tsx for the global story.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        mutate(undefined, { revalidate: false });
      }
    });
    return () => unsubscribe();
  }, [mutate]);

  // Extract top10 candidates
  const top10: Candidate[] = data?.top10 ?? [];
  const etiDistribution: EtiDistribution =
    data?.etiDistribution ?? buildEtiDistributionFromScores([]);

  // Determine loading state (only true if we have no cached data)
  const isLoadingData = isLoading && top10.length === 0;

  // Determine error state
  const errorMessage = error
    ? (error instanceof Error ? error.message : 'Failed to load results')
    : data?.error ?? null;

  // Manual revalidation function
  const revalidate = async () => {
    await mutate();
  };

  const seniority: string = data?.seniority ?? "";

  return {
    top10,
    etiDistribution,
    seniority,
    isLoading: isLoadingData,
    isValidating, // True when revalidating in background (has cached data)
    error: errorMessage,
    revalidate,
    mutate,
  };
}
