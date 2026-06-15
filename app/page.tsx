import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EigenWork - Intelligent Technical Candidate Evaluation",
  description: "Stop reviewing everyone, start interviewing the right ones. Evaluate candidates with ETI — EigenTrustIndex. Trust scores, operating profiles, and role fit in one place.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "EigenWork - Intelligent Technical Candidate Evaluation",
    description: "Stop reviewing everyone, start interviewing the right ones. Evaluate candidates with ETI — EigenTrustIndex.",
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
