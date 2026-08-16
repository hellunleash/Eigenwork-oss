"use client";

import { useEffect, useMemo, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { VendoOverlay, VendoRoot as VendoProviderRoot, createVendoClient } from "@vendoai/vendo/react";
import type { VendoTheme } from "@vendoai/vendo";
import { auth } from "@/lib/firebase";
import theme from "../.vendo/theme.json";

/**
 * The Vendo surface, authenticated with EigenWork's Firebase bearer token.
 *
 * ⚠ WHY THIS COMPONENT IS SHAPED LIKE THIS. `VendoClientConfig` exposes only
 * `{ baseUrl?, headers? }` — a STATIC header map captured when the client is
 * built. There is no `getToken()` callback and no `fetch` override, so a
 * rotating credential cannot be expressed directly. Firebase ID tokens expire
 * hourly and refresh in the background.
 *
 * The workaround: subscribe to `onIdTokenChanged` (which fires on sign-in,
 * sign-out AND every silent refresh) and REBUILD the client each time, keyed by
 * the token so React remounts the provider with the fresh header. Requests
 * started before a refresh still carry the old token — acceptable for short
 * turns, not for a long-lived stream that outlives the expiry.
 *
 * The durable fix is a Firebase session COOKIE minted server-side with Admin
 * `createSessionCookie`, which the browser sends automatically and which the
 * `principal` resolver in `vendo/server.ts` can read off the Request. That is
 * what Vendo's four auth presets (authJs, clerk, supabase, auth0) all assume —
 * they are cookie/session based. Filed as a findings item.
 */
/**
 * ⚠ THE HOST'S TREE IS NEVER INSIDE THE PROVIDER. This is load-bearing, and it
 * cost a live outage to learn.
 *
 * The first version rendered `<VendoProviderRoot key={token}>{children}…`, so
 * the whole EigenWork app sat under a provider keyed by the Firebase ID token.
 * Two failures fell straight out of that:
 *
 *   1. On first paint `token` is null, so the app rendered bare; auth then
 *      resolved and the tree switched to the provider-wrapped branch, which
 *      REMOUNTS every page. In-flight requests were aborted mid-flight and the
 *      pipeline page showed "An error occurred while fetching the data."
 *   2. `onIdTokenChanged` also fires on every silent hourly refresh, changing
 *      `key` and remounting the entire product again — wiping SWR caches, form
 *      state and scroll position, for a token rotation the user never saw.
 *
 * So `children` renders unconditionally, outside and independent of Vendo, and
 * the provider wraps ONLY the overlay. Remounting the agent surface on a token
 * rotation is free; remounting the product is not.
 */
export function VendoSurface({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Fires on sign-in, sign-out, and every silent token refresh.
    return onIdTokenChanged(auth, async (user) => {
      setToken(user ? await user.getIdToken() : null);
    });
  }, []);

  // Rebuilt only when the token actually rotates, not on every host re-render.
  const client = useMemo(
    () =>
      token == null
        ? null
        : createVendoClient({
            baseUrl: "/api/vendo",
            headers: { authorization: `Bearer ${token}` },
          }),
    [token],
  );

  return (
    <>
      {children}
      {client !== null && (
        <VendoProviderRoot key={token} client={client} theme={theme as VendoTheme}>
          <VendoOverlay />
        </VendoProviderRoot>
      )}
    </>
  );
}
