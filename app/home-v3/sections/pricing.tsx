"use client";

// =============================================================================
// v3 pricing teaser — same three tiers, numbers, and features as live
// (ADR-002 / /pricing). Featured tier carries the emerald commitment and a
// gentle lift; Ashby line stays honestly badged "Coming soon".
// =============================================================================

import { CheckIcon, ClockIcon } from "../icons";

type Feature = { label: string; soon?: boolean };

const TIERS: {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  features: Feature[];
  cta: string;
  featured: boolean;
}[] = [
  {
    name: "Free",
    price: "$0",
    unit: "forever",
    blurb: "Your first role. No card.",
    features: [
      { label: "1 role · 100 candidates" },
      { label: "Ranked shortlist with risk flags" },
      { label: "Operate from Slack — daily limit" },
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Single role",
    price: "$149",
    unit: "/ role",
    blurb: "One focused hire, 60 days.",
    features: [
      { label: "1 role · 1,500 candidates" },
      { label: "Operate from Slack + outreach drafting" },
      { label: "Full reports + CSV export" },
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: "Team",
    price: "$699",
    unit: "/ team",
    blurb: "Your whole cohort, 6 months.",
    features: [
      { label: "10 roles · 15,000 candidates" },
      { label: "Shared workspace + analytics" },
      { label: "Operate from Slack + outreach drafting" },
      { label: "Ashby ATS agent", soon: true },
    ],
    cta: "Get started",
    featured: false,
  },
];

export function Pricing({ onCta }: { onCta: () => void }) {
  return (
    <section className="py-24 md:py-32 border-t border-white/[0.05]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl">
          <h2 className="v3-display text-3xl md:text-5xl font-semibold leading-[1.05] text-zinc-50 text-balance">
            Per role. Pay once. No subscription.
          </h2>
          <p className="mt-5 text-base md:text-lg text-zinc-400 text-pretty">
            EigenWork works in Slack on every plan. Start free; upgrade when you have a real hire to
            make.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`hover-lift rounded-2xl border p-8 flex flex-col ${
                t.featured
                  ? "border-emerald-400/30 bg-emerald-400/[0.05] md:-mt-3 md:mb-3 shadow-[0_24px_70px_-30px_rgba(52,211,153,0.25)]"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              <p className={`text-base font-medium ${t.featured ? "text-emerald-300" : "text-zinc-400"}`}>{t.name}</p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="v3-display text-[2.6rem] font-semibold leading-none text-zinc-50 tabular-nums">
                  {t.price}
                </span>
                <span className="text-sm text-zinc-500">{t.unit}</span>
              </p>
              <p className="mt-3 mb-7 text-sm text-zinc-400">{t.blurb}</p>
              <ul className="space-y-3 mb-8 text-sm text-zinc-300">
                {t.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2.5">
                    {f.soon ? (
                      <>
                        <ClockIcon className="w-4.5 h-4.5 text-zinc-500 shrink-0 mt-0.5" />
                        <span className="text-zinc-400">
                          {f.label}
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-medium align-middle">
                            Coming soon
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{f.label}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCta}
                className={`mt-auto inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                  t.featured
                    ? "sheen bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                    : "bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]"
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-9 text-center text-xs text-zinc-500">
          <a
            href="/pricing"
            className="underline-offset-2 hover:text-zinc-300 hover:underline transition-colors"
          >
            See full pricing &amp; Enterprise &rarr;
          </a>
          {" · Overage available, never expires."}
        </p>
      </div>
    </section>
  );
}
