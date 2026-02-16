import useSWR from 'swr';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Pipeline = {
  id: string;
  title: string;
  createdAt: number | null;
  submissionCap: number;
  isClosed: boolean;
  appliedCount: number;
  hasMatchResult?: boolean;
};

type UserProfile = {
  eigenCredits: number;
};

type DashboardData = {
  pipelines: Pipeline[];
  eigenCredits: number;
};

// Fetcher function for SWR
const fetcher = async (url: string): Promise<any> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

/**
 * Custom hook for fetching dashboard data with stale-while-revalidate pattern.
 * 
 * Features:
 * - Fetches /api/user/me and /api/jd/list in parallel
 * - Caches data per userId
 * - Prevents duplicate requests
 * - Shows cached data immediately while revalidating in background
 * - Automatically revalidates on focus and interval
 * - Handles logout cache invalidation
 * - Safe for Next.js SSR (client-side only)
 */
export function useDashboardData(userId: string | null) {
  // Fetch pipelines
  const {
    data: pipelinesData,
    error: pipelinesError,
    isLoading: pipelinesLoading,
    isValidating: pipelinesValidating,
    mutate: mutatePipelines,
  } = useSWR<{ pipelines: Pipeline[] } | Pipeline[]>(
    userId ? `/api/jd/list?userId=${encodeURIComponent(userId)}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000, // Prevent duplicate requests within 2 seconds
      refreshInterval: 0, // Disable auto-refresh, rely on focus/reconnect
      // SWR preserves previous data during revalidation by default
      onError: (error) => {
        console.error('Failed to fetch pipelines:', error);
      },
    }
  );

  // Fetch user profile (eigenCredits)
  const {
    data: userData,
    error: userError,
    isLoading: userLoading,
    isValidating: userValidating,
    mutate: mutateUser,
  } = useSWR<UserProfile>(
    userId ? `/api/user/me?userId=${encodeURIComponent(userId)}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      refreshInterval: 0,
      // SWR preserves previous data during revalidation by default
      onError: (error) => {
        console.error('Failed to fetch user profile:', error);
      },
    }
  );

  // Invalidate cache on logout
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user && userId) {
        // User logged out, invalidate all caches
        mutatePipelines(undefined, { revalidate: false });
        mutateUser(undefined, { revalidate: false });
      }
    });

    return () => unsubscribe();
  }, [userId, mutatePipelines, mutateUser]);

  // Combine data - handle both { pipelines: [] } and [] response formats
  // SWR preserves previous data during revalidation by default, so pipelinesData/userData
  // will never be undefined during revalidation - it keeps the previous value
  const pipelines: Pipeline[] = Array.isArray(pipelinesData)
    ? pipelinesData
    : (pipelinesData && 'pipelines' in pipelinesData ? pipelinesData.pipelines : []);
  
  // Preserve previous eigenCredits value - SWR keeps previous data during revalidation
  const eigenCredits = userData?.eigenCredits ?? 0;

  // Determine loading state (only true if we have no cached data and are loading)
  // isValidating means revalidating in background, which shouldn't show loading spinner
  // Never show loading if we have cached data (even if it's empty array - that's valid data)
  const hasCachedData = pipelinesData !== undefined || userData !== undefined;
  const isLoading = (pipelinesLoading || userLoading) && !hasCachedData;
  const isValidating = pipelinesValidating || userValidating;

  // Determine error state
  const error = pipelinesError || userError;

  // Manual revalidation function
  const revalidate = async () => {
    await Promise.all([mutatePipelines(), mutateUser()]);
  };

  return {
    pipelines,
    eigenCredits,
    isLoading,
    isValidating, // True when revalidating in background (has cached data)
    error: error ? (error instanceof Error ? error.message : 'Failed to load dashboard data') : null,
    revalidate,
    mutatePipelines,
    mutateUser,
  };
}
