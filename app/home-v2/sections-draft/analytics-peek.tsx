"use client";

// =============================================================================
// DRAFT /home-v2 — Team analytics peek.
// Three tiles chosen deliberately: the ones UNIQUE to EigenWork's ranking IP,
// not generic ATS metrics (time-to-fill / offer-acceptance were dropped):
//   1. Inflated profiles found      — the fraud-catch differentiator
//   2. Shortlist quality            — proof the ranking actually works
//   3. Source quality leaderboard   — where the good candidates come from
// Figures mirror the in-app Team analytics sample (app/user/analytics) and are
// labeled "Sample", same honesty pattern the in-app page uses.
//
// Voice contract: NO internal scoring acronyms, outcome-first, recruiter POV.
// Self-contained — inline SVG icons, no shared deps.
// =============================================================================

import type { ReactNode } from "react";

type Tier = { label: string; sub: string; passed: number; interviewed: number; tone: string };
type SourceRow = { name: string; submissions: number; top10: number; selected: number; cleared: number; hires: number };

const SHORTLIST_TIERS: Tier[] = [
  { label: "Top 10", sub: "8 of 10 selected", passed: 7, interviewed: 8, tone: "bg-teal-500" },
  { label: "Top 20", sub: "12 of 20 selected", passed: 9, interviewed: 12, tone: "bg-emerald-500" },
  { label: "Ranks 11–20", sub: "4 selected", passed: 2, interviewed: 4, tone: "bg-amber-500" },
];

const SOURCES: SourceRow[] = [
  { name: "Referrals", submissions: 41, top10: 9, selected: 7, cleared: 5, hires: 5 },
  { name: "Hacker News Who's Hiring", submissions: 84, top10: 14, selected: 10, cleared: 6, hires: 6 },
  { name: "LinkedIn (organic)", submissions: 312, top10: 22, selected: 16, cleared: 7, hires: 9 },
  { name: "Company site", submissions: 67, top10: 5, selected: 3, cleared: 1, hires: 2 },
  { name: "Indeed", submissions: 188, top10: 6, selected: 4, cleared: 1, hires: 2 },
];

export function AnalyticsPeek() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            Not just a shortlist &mdash; proof it&rsquo;s working.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            On the Team plan, your screens roll up into the inflated profiles you caught, how well
            your top-ranked candidates clear interviews, and which sources actually send talent.
          </p>
        </div>

        {/* Dashboard header + tiles. No outer card wrapper — impeccable: nested
            cards are always wrong; the KpiTiles are the only card layer. */}
        <div className="border-t border-zinc-200 dark:border-white/[0.08] pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Team workspace
              </span>
              <span className="text-zinc-300 dark:text-white/15">·</span>
              <span>This quarter</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
              Sample
            </span>
          </div>

          <div className="grid grid-cols-12 gap-3">
            {/* Inflated profiles found */}
            <KpiTile className="col-span-12 sm:col-span-4" accent="rose">
              <KpiLabel icon={<IconShield />}>Inflated profiles found</KpiLabel>
              <p className="mt-1.5 text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">
                23<span className="text-base font-normal text-zinc-500 ml-1">this quarter</span>
              </p>
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <span aria-hidden="true">▲</span>
                <span>flagged before the call</span>
              </p>
              <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                Staged repos and claims the code didn&rsquo;t back — caught before they reached an interview.
              </p>
            </KpiTile>

            {/* Shortlist quality */}
            <KpiTile className="col-span-12 sm:col-span-8" accent="emerald">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <KpiLabel icon={<IconStack />}>Shortlist quality</KpiLabel>
                  <p className="mt-1.5 text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">
                    88<span className="text-base font-normal text-zinc-500 ml-0.5">%</span>
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 ml-2">top-10 clear rate</span>
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    7 of 8 selected from your top 10 cleared interview
                  </p>
                </div>
                <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-medium text-right shrink-0">
                  50 shortlisted<br />last 90 days
                </span>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                Interview-clear rate by shortlist depth
              </p>
              <ul className="space-y-2.5">
                {SHORTLIST_TIERS.map((t) => (
                  <ShortlistTierRow key={t.label} t={t} />
                ))}
              </ul>
            </KpiTile>

            {/* Source quality leaderboard */}
            <KpiTile className="col-span-12" accent="emerald">
              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                  <KpiLabel icon={<IconTrophy />}>Source quality leaderboard</KpiLabel>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 max-w-2xl">
                    Share of each source&rsquo;s applicants that reach your top-10 shortlist — so you spend
                    on the channels that actually send talent.
                  </p>
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Ranked by top-10 reach</span>
              </div>
              <SourceLeaderboard rows={SOURCES} />
            </KpiTile>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- KPI primitives (mirror app/user/analytics) ----------------------

function KpiTile({
  className = "",
  accent,
  children,
}: {
  className?: string;
  accent: "sky" | "emerald" | "rose" | "teal";
  children: ReactNode;
}) {
  const rail = {
    sky: "before:bg-sky-500/70",
    emerald: "before:bg-emerald-500/70",
    rose: "before:bg-rose-500/70",
    teal: "before:bg-teal-500/70",
  }[accent];
  return (
    <div
      className={`relative bg-white dark:bg-white/[0.02] rounded-xl border border-zinc-200/80 dark:border-white/[0.06] p-4 overflow-hidden before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r ${rail} ${className}`}
    >
      {children}
    </div>
  );
}

function KpiLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      {children}
    </p>
  );
}

function ShortlistTierRow({ t }: { t: Tier }) {
  const pct = t.interviewed > 0 ? Math.round((t.passed / t.interviewed) * 100) : 0;
  return (
    <li className="grid grid-cols-12 items-center gap-3">
      <div className="col-span-4 min-w-0">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{t.label}</p>
        <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400">{t.sub}</p>
      </div>
      <div className="col-span-5">
        <div className="w-full h-2 bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${t.tone}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="col-span-3 text-right">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">{pct}%</span>
        <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 ml-1 tabular-nums">
          {t.passed}/{t.interviewed}
        </span>
      </div>
    </li>
  );
}

function SourceLeaderboard({ rows }: { rows: SourceRow[] }) {
  const penOf = (s: SourceRow) => (s.submissions > 0 ? (s.top10 / s.submissions) * 100 : 0);
  const clearOf = (s: SourceRow) => (s.selected > 0 ? Math.round((s.cleared / s.selected) * 100) : 0);
  const max = Math.max(...rows.map(penOf));
  const sorted = [...rows].sort((a, b) => penOf(b) - penOf(a));
  return (
    <ol className="space-y-2.5">
      {sorted.map((s, i) => {
        const pen = penOf(s);
        const pct = max > 0 ? (pen / max) * 100 : 0;
        const tone = pen >= 18 ? "bg-teal-500" : pen >= 10 ? "bg-emerald-500" : pen >= 5 ? "bg-amber-500" : "bg-rose-500";
        const textTone =
          pen >= 18
            ? "text-teal-600 dark:text-teal-400"
            : pen >= 10
              ? "text-emerald-600 dark:text-emerald-400"
              : pen >= 5
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400";
        return (
          <li key={s.name} className="grid grid-cols-12 items-center gap-3">
            <div className="col-span-1 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 tabular-nums">
              #{i + 1}
            </div>
            <div className="col-span-4 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.name}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {s.hires} hires · {s.submissions} subs
                <span className="text-zinc-400 dark:text-zinc-500"> · {clearOf(s)}% interview-clear</span>
              </p>
            </div>
            <div className="col-span-5">
              <div className="w-full h-2 bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="col-span-2 text-right">
              <span className={`text-base font-semibold tabular-nums ${textTone}`}>{Math.round(pen)}%</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 ml-1">top-10</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Icons -----------------------------------------------------------

const I = "w-3.5 h-3.5";

function IconShield() {
  return (
    <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.6-3.4A12 12 0 0112 2a12 12 0 01-8.6 4.6L3 7v5a9 9 0 009 9 9 9 0 009-9V7z" />
    </svg>
  );
}

function IconStack() {
  return (
    <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11l-7-7-7 7m14 0v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6m14 0H5" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8m-4 0v-4m6-13H6v6a6 6 0 0012 0V4zm0 0h3v2a3 3 0 01-3 3M6 4H3v2a3 3 0 003 3" />
    </svg>
  );
}
