"use client";

// =============================================================================
// v3 analytics peek — same three deliberately-chosen tiles as live (fraud
// catches, shortlist quality, source leaderboard), restaged dark with motion:
// the two headline numbers count up and every bar draws in when the section
// enters view. Bars ship full-width in server HTML (no-JS correct) and only
// animate after hydration (.v3-bar-armed pattern). Sample badge kept — honesty.
// =============================================================================

import type { ReactNode } from "react";
import { useArmed, useCountUp, useInView } from "../motion";
import { ShieldIcon, StackIcon, TrophyIcon } from "../icons";

type Tier = { label: string; sub: string; passed: number; interviewed: number; tone: string };
type SourceRow = { name: string; submissions: number; top10: number; selected: number; cleared: number; hires: number };

const SHORTLIST_TIERS: Tier[] = [
  { label: "Top 10", sub: "8 of 10 selected", passed: 7, interviewed: 8, tone: "bg-teal-400" },
  { label: "Top 20", sub: "12 of 20 selected", passed: 9, interviewed: 12, tone: "bg-emerald-400" },
  { label: "Ranks 11–20", sub: "4 selected", passed: 2, interviewed: 4, tone: "bg-amber-400" },
];

const SOURCES: SourceRow[] = [
  { name: "Referrals", submissions: 41, top10: 9, selected: 7, cleared: 5, hires: 5 },
  { name: "Hacker News Who's Hiring", submissions: 84, top10: 14, selected: 10, cleared: 6, hires: 6 },
  { name: "LinkedIn (organic)", submissions: 312, top10: 22, selected: 16, cleared: 7, hires: 9 },
  { name: "Company site", submissions: 67, top10: 5, selected: 3, cleared: 1, hires: 2 },
  { name: "Indeed", submissions: 188, top10: 6, selected: 4, cleared: 1, hires: 2 },
];

export function AnalyticsPeek() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const armed = useArmed();
  const flagged = useCountUp(23, { start: inView });
  const clearRate = useCountUp(88, { start: inView });
  const barCls = `v3-bar ${armed ? "v3-bar-armed" : ""} ${inView ? "v3-bar-in" : ""}`;

  return (
    <section className="py-24 md:py-32">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <h2 className="v3-display text-3xl md:text-5xl font-semibold leading-[1.05] text-zinc-50 text-balance">
            Not just a shortlist &mdash; proof it&rsquo;s working.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-400 leading-relaxed text-pretty">
            On the Team plan, your screens roll up into the inflated profiles you caught, how well
            your top-ranked candidates clear interviews, and which sources actually send talent.
          </p>
        </div>

        <div ref={ref} className="border-t border-white/[0.08] pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Team workspace
              </span>
              <span className="text-white/15">·</span>
              <span>This quarter</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[11px] font-medium">
              Sample
            </span>
          </div>

          <div className="grid grid-cols-12 gap-3">
            {/* Inflated profiles found */}
            <KpiTile className="col-span-12 sm:col-span-4">
              <KpiLabel icon={<ShieldIcon />} tone="text-rose-400">Inflated profiles found</KpiLabel>
              <p className="mt-2 text-3xl font-semibold text-zinc-50 tabular-nums">
                {flagged}
                <span className="text-base font-normal text-zinc-500 ml-2">this quarter</span>
              </p>
              <p className="mt-1 text-[11px] text-emerald-400 inline-flex items-center gap-1">
                <span aria-hidden="true">▲</span>
                <span>flagged before the call</span>
              </p>
              <p className="mt-3 text-xs text-zinc-500 leading-snug">
                Staged repos and claims the code didn&rsquo;t back &mdash; caught before they reached
                an interview.
              </p>
            </KpiTile>

            {/* Shortlist quality */}
            <KpiTile className="col-span-12 sm:col-span-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <KpiLabel icon={<StackIcon />} tone="text-emerald-400">Shortlist quality</KpiLabel>
                  <p className="mt-2 text-3xl font-semibold text-zinc-50 tabular-nums">
                    {clearRate}
                    <span className="text-base font-normal text-zinc-500 ml-0.5">%</span>
                    <span className="text-sm font-medium text-zinc-400 ml-2">top-10 clear rate</span>
                  </p>
                  <p className="text-[11px] text-emerald-400 mt-0.5">
                    7 of 8 selected from your top 10 cleared interview
                  </p>
                </div>
                <span className="text-[10.5px] text-zinc-400 font-medium text-right shrink-0">
                  50 shortlisted<br />last 90 days
                </span>
              </div>
              <p className="mt-4 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 mb-2">
                Interview-clear rate by shortlist depth
              </p>
              <ul className="space-y-2.5">
                {SHORTLIST_TIERS.map((t) => (
                  <ShortlistTierRow key={t.label} t={t} barCls={barCls} />
                ))}
              </ul>
            </KpiTile>

            {/* Source quality leaderboard */}
            <KpiTile className="col-span-12">
              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                  <KpiLabel icon={<TrophyIcon />} tone="text-emerald-400">Source quality leaderboard</KpiLabel>
                  <p className="mt-1.5 text-sm text-zinc-300 max-w-2xl">
                    Share of each source&rsquo;s applicants that reach your top-10 shortlist &mdash;
                    so you spend on the channels that actually send talent.
                  </p>
                </div>
                <span className="text-[11px] text-zinc-500">Ranked by top-10 reach</span>
              </div>
              <SourceLeaderboard rows={SOURCES} barCls={barCls} />
            </KpiTile>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- KPI primitives ----------------------------------------------------

function KpiTile({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`bg-white/[0.02] rounded-xl border border-white/[0.06] p-5 ${className}`}>
      {children}
    </div>
  );
}

function KpiLabel({ icon, tone, children }: { icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
      <span className={tone}>{icon}</span>
      {children}
    </p>
  );
}

function Track({ children }: { children: ReactNode }) {
  return <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden">{children}</div>;
}

function ShortlistTierRow({ t, barCls }: { t: Tier; barCls: string }) {
  const pct = t.interviewed > 0 ? Math.round((t.passed / t.interviewed) * 100) : 0;
  return (
    <li className="grid grid-cols-12 items-center gap-3">
      <div className="col-span-4 min-w-0">
        <p className="text-xs font-medium text-zinc-200">{t.label}</p>
        <p className="text-[10.5px] text-zinc-500">{t.sub}</p>
      </div>
      <div className="col-span-5">
        <Track>
          <div className={`h-full rounded-full ${t.tone} ${barCls}`} style={{ width: `${pct}%` }} />
        </Track>
      </div>
      <div className="col-span-3 text-right">
        <span className="text-sm font-semibold text-zinc-100 tabular-nums">{pct}%</span>
        <span className="text-[10.5px] text-zinc-500 ml-1 tabular-nums">
          {t.passed}/{t.interviewed}
        </span>
      </div>
    </li>
  );
}

function SourceLeaderboard({ rows, barCls }: { rows: SourceRow[]; barCls: string }) {
  const penOf = (s: SourceRow) => (s.submissions > 0 ? (s.top10 / s.submissions) * 100 : 0);
  const clearOf = (s: SourceRow) => (s.selected > 0 ? Math.round((s.cleared / s.selected) * 100) : 0);
  const max = Math.max(...rows.map(penOf));
  const sorted = [...rows].sort((a, b) => penOf(b) - penOf(a));
  return (
    <ol className="space-y-2.5">
      {sorted.map((s, i) => {
        const pen = penOf(s);
        const pct = max > 0 ? (pen / max) * 100 : 0;
        const tone = pen >= 18 ? "bg-teal-400" : pen >= 10 ? "bg-emerald-400" : pen >= 5 ? "bg-amber-400" : "bg-rose-400";
        const textTone =
          pen >= 18 ? "text-teal-300" : pen >= 10 ? "text-emerald-300" : pen >= 5 ? "text-amber-300" : "text-rose-300";
        return (
          <li key={s.name} className="grid grid-cols-12 items-center gap-3">
            <div className="col-span-1 text-center text-xs font-semibold font-mono text-zinc-500 tabular-nums">
              #{i + 1}
            </div>
            <div className="col-span-4 min-w-0">
              <p className="text-sm font-medium text-zinc-100 truncate">{s.name}</p>
              <p className="text-[11px] text-zinc-500 tabular-nums">
                {s.hires} hires · {s.submissions} subs
                <span className="text-zinc-600"> · {clearOf(s)}% interview-clear</span>
              </p>
            </div>
            <div className="col-span-5">
              <Track>
                <div
                  className={`h-full rounded-full ${tone} ${barCls}`}
                  style={{ width: `${pct}%`, transitionDelay: `${i * 90}ms` }}
                />
              </Track>
            </div>
            <div className="col-span-2 text-right">
              <span className={`text-base font-semibold tabular-nums ${textTone}`}>{Math.round(pen)}%</span>
              <span className="text-[11px] text-zinc-500 ml-1">top-10</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
