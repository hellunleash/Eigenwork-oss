import type { Metadata } from "next";
import { HomeNav } from "./components/home-nav";
import { HomeHero } from "./components/home-hero";
import { HomeHowItWorks } from "./components/home-how-it-works";
import { HomeApplicantProfile } from "./components/home-applicant-profile";
import { HomeFeatures } from "./components/home-features";
import { HomeFooter } from "./components/home-footer";

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

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900 antialiased">
      <HomeNav />
      <HomeHero />
      <HomeHowItWorks />
      <HomeApplicantProfile />
      <HomeFeatures />
      <HomeFooter />
    </div>
  );
}
