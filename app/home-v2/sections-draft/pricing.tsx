"use client";

// =============================================================================
// DRAFT — slim, Slack-framed pricing (homepage teaser). Three tiers, Slack
// reality per plan (chat on every plan, outreach on paid), Ashby agent flagged
// "Coming soon" on Team. No "what most teams pick" claim (no fake social proof).
// Numbers match ADR-002 / the live /pricing page.
// =============================================================================

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
    <section className="py-20 md:py-28 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-medium tracking-[-0.03em] leading-[1.1] text-zinc-900 dark:text-zinc-100">
            Per role. Pay once. No subscription.
          </h2>
          <p className="mt-4 text-base md:text-lg text-zinc-600 dark:text-zinc-400">
            EigenWork works in Slack on every plan. Start free; upgrade when you have a real hire to make.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                t.featured
                  ? "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/[0.04]"
                  : "border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900"
              }`}
            >
              <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">{t.name}</p>
              <p className="mt-2">
                <span className="text-4xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">{t.price}</span>
                <span className="text-sm text-zinc-500 ml-2">{t.unit}</span>
              </p>
              <p className="mt-3 mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t.blurb}</p>
              <ul className="space-y-2.5 mb-8 text-sm text-zinc-700 dark:text-zinc-300">
                {t.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2">
                    {f.soon ? (
                      <>
                        <IconClock />
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {f.label}
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-medium align-middle">
                            Coming soon
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <IconCheck />
                        <span>{f.label}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCta}
                className={`mt-auto inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  t.featured
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100"
                    : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-white/[0.1]"
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          <a href="/pricing" className="underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline transition-colors">
            See full pricing &amp; Enterprise &rarr;
          </a>
          {" · Overage available, never expires."}
        </p>
      </div>
    </section>
  );
}

function IconCheck() {
  return (
    <svg
      className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg
      className="w-5 h-5 text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
