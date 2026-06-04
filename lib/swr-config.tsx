"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

/**
 * Global SWR provider for authenticated areas of the app.
 *
 * Why this file exists (it used to be empty):
 *   Without an SWRConfig wrapper, every useSWR call ran on bare SWR defaults.
 *   The two most important defaults this overrides are:
 *
 *     errorRetryCount:        5 -> 1
 *       The /api/jd/match endpoint can take up to ~50s. With default retries,
 *       a single failure could spend 5 minutes of compute and 5x the cost
 *       before giving up — and the user would see "loading" the entire time.
 *
 *     errorRetryInterval:     5_000ms (kept; explicit so it's reviewable)
 *
 *     focusThrottleInterval:  5_000 -> 15_000
 *       Default revalidate-on-focus throttles to 5s, which can re-fire
 *       expensive endpoints on every alt-tab. 15s is plenty for a hiring
 *       dashboard and keeps Vercel + Gemini bills predictable.
 *
 *     dedupingInterval:       2_000 -> 3_000
 *       Slightly longer dedup window so rapid re-renders during navigation
 *       don't multiply requests.
 *
 *     revalidateIfStale:      true (kept)
 *       Stale-while-revalidate is the whole point.
 *
 *   Hooks may override any of these per-call when they need to.
 *
 * Where to wrap:
 *   Wrap the authenticated app area (user dashboard subtree). The public
 *   pricing and homepage do not use SWR, so wrapping there has no effect
 *   but also no cost — wrap the highest convenient layout.
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        errorRetryCount: 1,
        errorRetryInterval: 5_000,
        focusThrottleInterval: 15_000,
        dedupingInterval: 3_000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        revalidateIfStale: true,
        // Do NOT retry on 401/403/404 — those are owner-check or token
        // failures and retrying just delays the right error path.
        shouldRetryOnError: (err: unknown) => {
          const status = (err as { status?: number } | null | undefined)?.status;
          if (status === 401 || status === 403 || status === 404) return false;
          return true;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
