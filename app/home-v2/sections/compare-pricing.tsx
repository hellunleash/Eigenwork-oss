"use client";

function IconX() {
  return (
    <svg
      className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
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

const BEFORE_ITEMS = [
  "Vibe-screening on 50 résumés",
  "Weeks per role",
  "Inflated profiles slip through",
  "Good candidates ghost on the take-home",
  "Your hiring manager wants more data",
  "$$$$ per seat in some ATS",
];

const AFTER_ITEMS = [
  "The top 5, ranked, ready",
  "Shortlist in under 60 seconds",
  "Inflated profiles surfaced before the call",
  "60-second intake, candidates actually finish",
  "Recommendation your hiring manager can defend",
  "$149 per role · pay once",
];

const FREE_FEATURES = [
  "1 role · 100 candidates",
  "Ranked shortlist with risk flags",
  "Sign in with Google",
];

const SINGLE_FEATURES = [
  "1 role · 1,500 candidates",
  "Full evidence trail",
  "Risk flags before interviews",
];

const TEAM_FEATURES = [
  "10 roles · 15,000 candidates",
  "Shared workspace",
  "CSV export",
];

export function ComparePricing({ onCta }: { onCta: () => void }) {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* ── SUBSECTION 1: Comparison ── */}
        <div className="mb-24 md:mb-32">
          {/* Header */}
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
              HONEST COMPARISON
            </p>
            <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
              EigenWork vs. how you screen today.
            </h2>
          </div>

          {/* Before / After duel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT — Without EigenWork */}
            <div className="rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50/30 dark:bg-red-500/5 p-8">
              <p className="text-xs font-mono uppercase tracking-wider text-red-700 dark:text-red-400 mb-3">
                BEFORE
              </p>
              <h3 className="text-xl md:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-6">
                Reading r&eacute;sum&eacute;s.
              </h3>
              <ul>
                {BEFORE_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 py-3 border-b border-red-100 dark:border-red-500/10 last:border-b-0"
                  >
                    <IconX />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* RIGHT — With EigenWork */}
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/5 p-8">
              <p className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-3">
                AFTER
              </p>
              <h3 className="text-xl md:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-6">
                Ranked shortlist.
              </h3>
              <ul>
                {AFTER_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 py-3 border-b border-emerald-100 dark:border-emerald-500/10 last:border-b-0"
                  >
                    <IconCheck />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── SUBSECTION 2: Pricing teaser ── */}
        <div>
          {/* Header */}
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
              PRICING
            </p>
            <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
              Per role. Pay once. No SaaS gotchas.
            </h2>
            <p className="mt-6 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Start free. Upgrade only when you have a real hire to make.
            </p>
          </div>

          {/* 3 pricing cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Card 1 — FREE */}
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 flex flex-col">
              <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">
                Free
              </p>
              <p className="mt-2">
                <span className="text-5xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                  $0
                </span>
                <span className="text-sm text-zinc-500 ml-2">forever</span>
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3 mb-6">
                For your first role. Try it without a card.
              </p>
              <ul className="space-y-2 mb-6 text-sm text-zinc-700 dark:text-zinc-300">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <IconCheck />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCta}
                className="mt-auto inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-900 dark:text-zinc-100 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors"
              >
                Start free
              </button>
            </div>

            {/* Card 2 — SINGLE ROLE (most popular, no border-glow) */}
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-10 md:p-12 flex flex-col">
              <p className="-mt-3 mb-3 text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                WHAT MOST TEAMS PICK
              </p>
              <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">
                Single role
              </p>
              <p className="mt-2">
                <span className="text-5xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                  $149
                </span>
                <span className="text-sm text-zinc-500 ml-2">/ role</span>
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3 mb-6">
                60 days, one focused hire.
              </p>
              <ul className="space-y-2 mb-6 text-sm text-zinc-700 dark:text-zinc-300">
                {SINGLE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <IconCheck />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCta}
                className="mt-auto inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
              >
                Get started
              </button>
            </div>

            {/* Card 3 — TEAM */}
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 flex flex-col">
              <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">
                Team
              </p>
              <p className="mt-2">
                <span className="text-5xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                  $699
                </span>
                <span className="text-sm text-zinc-500 ml-2">/ team</span>
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3 mb-6">
                6 months, your whole hiring cohort.
              </p>
              <ul className="space-y-2 mb-6 text-sm text-zinc-700 dark:text-zinc-300">
                {TEAM_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <IconCheck />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCta}
                className="mt-auto inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-900 dark:text-zinc-100 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors"
              >
                Talk to us
              </button>
            </div>
          </div>

          {/* Footer line */}
          <p className="mt-10 text-center text-xs text-zinc-500">
            <a
              href="/pricing"
              className="underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline transition-colors"
            >
              Enterprise plans available &rarr;
            </a>
            {" · Overage available, never expires."}
          </p>
        </div>
      </div>
    </section>
  );
}
