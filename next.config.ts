import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drop the "x-powered-by: Next.js" fingerprint header.
  poweredByHeader: false,

  /**
   * Keep the AI provider as a real file on disk in the deployed function.
   *
   * Vendo's credential ladder does not import the provider the normal way — it
   * resolves a PATH at runtime and imports that:
   *
   *   createRequire(join(root, "package.json")).resolve("@ai-sdk/openai")
   *
   * A bundled copy inlined into a server chunk cannot satisfy that: there is no
   * file at a node_modules path to resolve, so the require throws and Vendo
   * reports "OPENAI_API_KEY is set but @ai-sdk/openai is not installed in this
   * app" — in production only, while local dev (a real node_modules tree) works
   * perfectly. Marking it external makes Next ship the package as files
   * alongside the function instead of bundling it, which is what a runtime
   * require.resolve needs.
   *
   * The static import in `vendo/server.ts` is the other half: it makes Next's
   * file tracing include the package at all. Both are required — one gets it
   * deployed, this one keeps it resolvable.
   */
  serverExternalPackages: ["@ai-sdk/openai"],

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
