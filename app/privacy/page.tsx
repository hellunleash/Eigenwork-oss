import type { Metadata } from "next";
import { PrivacyPolicyContent } from "@/app/components/privacy-policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy — EigenWork",
  description:
    "EigenWork's Privacy Policy: what personal and candidate data we collect, how we process it, the AI services involved, your rights under GDPR/CCPA, and how to contact us.",
  alternates: { canonical: "/privacy" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

// Force static generation for crawler accessibility (matches /terms).
export const dynamic = "force-static";
export const revalidate = false;

export default function PrivacyPage() {
  const lastUpdated = "February 11, 2025";

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0e] py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Last updated: {lastUpdated}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          For the Terms of Service that govern use of the Platform, see{" "}
          <a
            href="/terms"
            className="font-medium text-gray-700 dark:text-gray-300 underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            /terms
          </a>
          .
        </p>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <PrivacyPolicyContent />
          </section>
        </div>
      </div>
    </div>
  );
}
