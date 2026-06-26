// =============================================================================
// DRAFT — "Three ways in, one engine".
// EigenWork is ONE backend reached from multiple entry points (ADR-004: one core,
// many front doors):
//   1. In Slack   — live. The daily-driver hook.
//   2. On the web — live. The full platform / deep dive.
//   3. In your ATS — COMING SOON, Ashby first (ADR-010 Phase 6 / Has-ATS ICP):
//      candidates apply into the customer's OWN ATS; EigenWork screens and writes
//      the ranking + notes back there. Clearly badged so it never reads as live.
//
// Impeccable: no eyebrow kicker; contrasting doors (not identical clones); the
// coming-soon door is visually distinct (dashed border + amber badge, muted).
// =============================================================================

import type { ReactNode } from "react";

export function FrontDoors() {
  return (
    <section id="how" className="py-20 md:py-28 bg-zinc-50/60 dark:bg-white/[0.015] border-y border-zinc-100 dark:border-white/[0.05] scroll-mt-14">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-medium tracking-[-0.03em] leading-[1.1] text-zinc-900 dark:text-zinc-100">
            Use it where your team already works.
          </h2>
          <p className="mt-4 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Slack, the web &mdash; and soon, right inside your own ATS. One engine behind every door:
            the same screens, the same shortlist, the same data. Switch anytime; nothing&rsquo;s trapped
            in one place.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Door icon={<HashGlyph className="w-5 h-5" />} title="In Slack" tagline="For the daily back-and-forth">
            Ask who&rsquo;s strongest and why, mint an intake link, move a candidate to interview, draft
            outreach &mdash; without leaving the channel you already live in.
          </Door>

          <Door icon={<WindowIcon className="w-5 h-5" />} title="On the web" tagline="For the deep dive &amp; setup">
            The full ranked pipeline, every candidate&rsquo;s evidence, your hiring analytics, and the
            shared team workspace and billing.
          </Door>

          <Door icon={<BoardIcon className="w-5 h-5" />} title="In your ATS" tagline="Ashby first" badge="Coming soon" muted>
            Candidates still apply through your EigenWork link and get screened first &mdash; then the
            ranked shortlist, evidence, and notes land in <span className="italic">your own</span> Ashby,
            ready for your team. Your ATS is the finish line, not another intake form.
          </Door>
        </div>

        <p className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <LinkIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          One login, one workspace &mdash; the same data wherever you open it.
        </p>
      </div>
    </section>
  );
}

function Door({
  icon,
  title,
  tagline,
  badge,
  muted = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  tagline: string;
  badge?: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-8 ${
        muted
          ? "border-dashed border-zinc-300 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.01]"
          : "border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center justify-center w-10 h-10 rounded-xl ${
              muted
                ? "bg-zinc-100 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400"
                : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {icon}
          </span>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{tagline}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-5 text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">{children}</p>
    </div>
  );
}

// ---------- Icons -----------------------------------------------------------

function HashGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function WindowIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  );
}

function BoardIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

function LinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}
