import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "EigenWork — Technical hiring, right from Slack" },
  description:
    "Post a role, get a ranked shortlist, and reach out — right from Slack. EigenWork reads each candidate's real code and work history, and flags the ones who don't hold up.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "EigenWork — Technical hiring, right from Slack",
    description: "Technical hiring, right from Slack. Post a role, get a ranked shortlist with risk flags, and reach out — the engine reads the actual work, not just the résumé.",
    type: "website",
  },
};

// Force static generation for crawler accessibility
export const dynamic = 'force-static';
export const revalidate = false;

// The homepage IS the former home-v2 design. Re-exported (not recomposed) so the
// app/home-v2 sections remain the single source of truth. The standalone
// /home-v2 route was retired (page.tsx → landing.tsx) so "v2" never shows in a URL.
export { default } from "./home-v2/landing";
