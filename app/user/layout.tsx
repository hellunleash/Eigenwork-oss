"use client";

import { SWRProvider } from "@/lib/swr-config";

/**
 * Layout for the authenticated employer area.
 *
 * Wraps everything under /user (dashboard, JD flows, candidate cards) with
 * the global SWR provider so dashboard, results, and any future
 * authenticated hook share a single set of defaults — most importantly a
 * low errorRetryCount so failing 50-second match requests don't retry 5×
 * and burn through both the user's patience and the OpenAI budget.
 *
 * The static, unauthenticated pages (/, /pricing, /terms) intentionally
 * sit OUTSIDE this layout so they stay server-rendered and stay
 * crawler-friendly.
 *
 * See lib/swr-config.tsx for the actual provider options.
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <SWRProvider>{children}</SWRProvider>;
}
