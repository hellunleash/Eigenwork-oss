import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drop the "x-powered-by: Next.js" fingerprint header.
  poweredByHeader: false,

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
