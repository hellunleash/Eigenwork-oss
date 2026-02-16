import useSWR from 'swr';

type RoleFit = {
  one_liner?: string;
  title?: string;
  primary?: string[];
  secondary?: string[];
  tertiary?: string[];
};

export type Candidate = {
  id: string;
  score: number;
  yoe?: number;
  profile?: { role_fit?: RoleFit | string };
  role_fit?: RoleFit | string;
  candidateName?: string;
  email?: string;
  phone?: string | null;
  matchData: {
    locations: string[];
    workTypes: string[];
    work_auth: string;
  };
  resume_url?: string;
};

type MatchResultsResponse = {
  top10: Candidate[];
  success?: boolean;
  error?: string;
};

// Fetcher function for SWR
const fetcher = async (url: string): Promise<MatchResultsResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    (error as any).status = res.status;
    const data = await res.json().catch(() => ({}));
    (error as any).message = data.error ?? 'Failed to load results';
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

  // Extract top10 candidates
  const top10: Candidate[] = data?.top10 ?? [];

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

  return {
    top10,
    isLoading: isLoadingData,
    isValidating, // True when revalidating in background (has cached data)
    error: errorMessage,
    revalidate,
    mutate,
  };
}
