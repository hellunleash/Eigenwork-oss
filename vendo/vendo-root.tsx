"use client";

import { useEffect, useState } from "react";
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
export function VendoSurface({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fires on sign-in, sign-out, and every silent token refresh.
    return onIdTokenChanged(auth, async (user) => {
      setToken(user ? await user.getIdToken() : null);
      setReady(true);
    });
  }, []);

  // Until auth resolves, render the app without the agent rather than mounting
  // a client that would 401 every request.
  if (!ready || token == null) return <>{children}</>;

  const client = createVendoClient({
    baseUrl: "/api/vendo",
    headers: { authorization: `Bearer ${token}` },
  });

  return (
    <VendoProviderRoot key={token} client={client} theme={theme as VendoTheme}>
      {children}
      <VendoOverlay />
    </VendoProviderRoot>
  );
}
