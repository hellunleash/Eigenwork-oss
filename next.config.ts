import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drop the "x-powered-by: Next.js" fingerprint header.
  poweredByHeader: false,


  // Brand the Firebase OAuth handoff on our own domain. signInWithPopup opens
  // {authDomain}/__/auth/handler; with authDomain=eigenwork.com the popup shows
  // eigenwork.com instead of the unbranded eigenwork.firebaseapp.com. We proxy
  // that path back to Firebase so the handler still works. INERT until
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is flipped to eigenwork.com AND
  // https://eigenwork.com/__/auth/handler is added to the OAuth client's
  // authorized redirect URIs in Google Cloud Console (else: redirect_uri_mismatch).
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://eigenwork.firebaseapp.com/__/auth/:path*",
      },
    ];
  },

  // Defense-in-depth response headers (the safe set — no CSP, so nothing in the
  // Paddle / Firebase / Turnstile flows is affected). Applied to every route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
