import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — EigenWork",
  description:
    "EigenWork pricing: a free tier, one-time Single Role and Team plans, and pay-as-you-go overage. Priced per role and per candidate screen — the way hiring teams actually budget.",
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    title: "EigenWork Pricing",
    description:
      "A free tier, one-time Single Role ($149) and Team ($699) plans, plus $0.15/screen overage. Priced per role, not per seat.",
    url: "/pricing",
    siteName: "EigenWork",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EigenWork Pricing",
    description: "Free tier, one-time Single Role & Team plans, $0.15/screen overage.",
  },
};

export const dynamic = "force-static";
export const revalidate = false;

type Tier = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "no card required",
    tagline: "Taste the product on one role.",
    features: ["1 active role", "100 candidate screens", "ETI scoring + ranking"],
    cta: { label: "Start free", href: "/user/dashboard" },
  },
  {
    name: "Single Role",
    price: "$149",
    cadence: "one-time · valid 60 days",
    tagline: "Fill one role. No subscription.",
    features: [
      "1 active role",
      "Up to 1,500 candidate screens",
      "ETI scoring + ranking",
      "Candidate reports + CSV export",
    ],
    cta: { label: "Get started", href: "/user/dashboard" },
  },
  {
    name: "Team",
    price: "$699",
    cadence: "one-time · 6 months",
    tagline: "Your whole hiring team, one workspace.",
    highlight: true,
    features: [
      "Up to 10 active roles",
      "15,000 candidate screens",
      "Shared workspace + invites (Owner / Admin / Member)",
      "Ashby ATS push (coming soon)",
      "Basic pipeline analytics",
    ],
    cta: { label: "Get started", href: "/user/dashboard" },
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual",
    tagline: "Scale hiring with controls.",
    features: ["Unlimited roles", "Custom screen volume", "SSO / SAML", "Audit logs + SLA", "Dedicated support"],
    cta: { label: "Contact us", href: "mailto:eigenwork.team@gmail.com" },
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0e] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] transition-colors duration-300 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">Pricing that fits how you hire</h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Priced per <span className="font-medium text-gray-900 dark:text-gray-200">role</span> and per{" "}
            <span className="font-medium text-gray-900 dark:text-gray-200">candidate screen</span> — not per seat. Start free, pay once
            per role, or run a shared Team workspace.
          </p>
        </div>

        {/* Tiers */}
        <div className="mt-12 grid gap-5 lg:grid-cols-4 md:grid-cols-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 bg-white dark:bg-white/[0.02] transition-colors duration-300 ${
                t.highlight ? "border-gray-900 dark:border-white/[0.1] shadow-md dark:shadow-2xl dark:shadow-white/5" : "border-gray-200 dark:border-white/[0.05] shadow-sm dark:shadow-none"
              }`}
            >
              {t.highlight && (
                <span className="self-start mb-3 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 min-h-[2.5rem]">{t.tagline}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{t.price}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 mb-5">{t.cadence}</p>
              <Link
                href={t.cta.href}
                className={`w-full text-center py-2.5 rounded-lg text-sm font-medium mb-6 transition-colors ${
                  t.highlight
                    ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                    : "border border-gray-300 text-gray-900 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.04]"
                }`}
              >
                {t.cta.label}
              </Link>
              <ul className="space-y-2.5 mt-auto">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-400">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Overage + unit explainer */}
        <div className="mt-12 grid md:grid-cols-2 gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-6 dark:bg-white/[0.02] dark:border-white/[0.05] shadow-sm dark:shadow-none">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Screen Wallet — pay-as-you-go overage</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Go past your plan&apos;s screens and they draw from a prepaid Screen Wallet at{" "}
              <span className="font-medium text-gray-900 dark:text-gray-200">$0.15 per screen</span>. Top up any amount; it never expires
              and is only used after your plan&apos;s screens run out.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 dark:bg-white/[0.02] dark:border-white/[0.05] shadow-sm dark:shadow-none">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">What&apos;s a candidate screen?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              One screen = one candidate run through EigenWork&apos;s EigenTrustIndex (ETI), returning a score and an
              evaluation report. You buy roles and screens — never seats.
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-500 mt-10">
          Questions about pricing or volume?{" "}
          <a href="mailto:eigenwork.team@gmail.com" className="font-medium text-gray-900 dark:text-gray-200 underline hover:text-gray-700 dark:hover:text-gray-100">
            eigenwork.team@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}
