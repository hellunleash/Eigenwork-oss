import type { Metadata } from "next";
import Link from "next/link";
import { WALLET_UNIT_PRICE } from "@/lib/wallet-config";
import { BILLING_EMAIL } from "@/lib/contact";

const WALLET_PRICE_DISPLAY = `$${WALLET_UNIT_PRICE.toFixed(2)}`;

export const metadata: Metadata = {
  title: "Pricing — EigenWork",
  description:
    "EigenWork pricing: a free tier, one-time Single Role and Team plans, and a prepaid Screen Wallet for overage. Priced per role and per candidate screen — the way hiring teams actually budget.",
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    title: "EigenWork Pricing",
    description: `A free tier, one-time Single Role ($149) and Team ($699) plans, plus ${WALLET_PRICE_DISPLAY}/screen overage. Priced per role, not per seat.`,
    url: "/pricing",
    siteName: "EigenWork",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EigenWork Pricing",
    description: `Free tier, one-time Single Role & Team plans, ${WALLET_PRICE_DISPLAY}/screen overage.`,
  },
};

export const dynamic = "force-static";
export const revalidate = false;

type Feature = { label: string; soon?: boolean };
type Tier = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: Feature[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "no card required",
    tagline: "Try it on one role.",
    features: [
      { label: "1 active role" },
      { label: "100 candidate screens" },
      { label: "Ranked shortlist with risk flags" },
      { label: "Operate from Slack — daily limit" },
    ],
    cta: { label: "Start free", href: "/user/dashboard" },
  },
  {
    name: "Single Role",
    price: "$149",
    cadence: "one-time · valid 60 days",
    tagline: "Fill one role. No subscription.",
    features: [
      { label: "1 active role" },
      { label: "Up to 1,500 candidate screens" },
      { label: "Operate from Slack + outreach drafting" },
      { label: "Full candidate reports + CSV export" },
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
      { label: "Up to 10 active roles" },
      { label: "15,000 candidate screens" },
      { label: "Shared workspace + invites (Owner / Admin / Member)" },
      { label: "Operate from Slack + outreach drafting" },
      { label: "Hiring analytics" },
      { label: "Ashby ATS agent", soon: true },
    ],
    cta: { label: "Get started", href: "/user/dashboard" },
  },
];

function CheckIcon() {
  return (
    <svg className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-[18px] h-[18px] text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export default function PricingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "EigenWork",
    "applicationCategory": "BusinessApplication",
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "USD",
      "lowPrice": "0",
      "highPrice": "699",
      "offers": TIERS.map((t) => ({
        "@type": "Offer",
        "name": t.name,
        "price": t.price === "Custom" ? "0" : t.price.replace("$", ""),
        "priceCurrency": "USD",
        "description": t.tagline,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Minimal top bar */}
      <header className="border-b border-zinc-100 dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
            EigenWork
          </Link>
          <Link href="/" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            ← Back to home
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        {/* Header */}
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            Per role. Pay once. No subscription.
          </h1>
          <p className="mt-5 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Priced per <span className="font-medium text-zinc-900 dark:text-zinc-200">role</span> and per{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-200">candidate screen</span> — never per seat.
            Works in Slack on every plan. Start free, pay once per role, or run a shared Team workspace.
          </p>
        </div>

        {/* Tiers */}
        <div className="mt-12 grid gap-5 lg:grid-cols-3 md:grid-cols-2">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-7 ${
                t.highlight
                  ? "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/[0.04]"
                  : "border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900"
              }`}
            >
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-5 min-h-[2.5rem]">{t.tagline}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50">{t.price}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1 mb-6">{t.cadence}</p>
              <Link
                href={t.cta.href}
                className={`w-full text-center py-2.5 rounded-full text-sm font-medium mb-7 transition-colors ${
                  t.highlight
                    ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/[0.1]"
                }`}
              >
                {t.cta.label}
              </Link>
              <ul className="space-y-2.5 mt-auto">
                {t.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2 text-sm">
                    {f.soon ? (
                      <>
                        <ClockIcon />
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {f.label}
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-medium align-middle">
                            Coming soon
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckIcon />
                        <span className="text-zinc-700 dark:text-zinc-300">{f.label}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Overage + unit explainer */}
        <div className="mt-12 grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-6">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">Screen Wallet — prepaid overage</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Go past your plan&apos;s screens and they draw from a prepaid Screen Wallet at{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-200">{WALLET_PRICE_DISPLAY} per screen</span>. Top up any
              amount; it never expires and is only used after your plan&apos;s screens run out.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-6">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">What&apos;s a candidate screen?</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              One screen = one candidate run through EigenWork — reading their code and work history, then returning a
              ranked result with the evidence and any risk flags. You buy roles and screens — never seats.
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-12">
          Questions about pricing or volume?{" "}
          <a href={`mailto:${BILLING_EMAIL}`} className="font-medium text-zinc-900 dark:text-zinc-200 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-100">
            {BILLING_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
