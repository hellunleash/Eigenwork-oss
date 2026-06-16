"use client";

// /user/analytics — the v2 Analytics preview, promoted onto the real route
// VERBATIM. The design and ALL its figures are unchanged from app/user/analytics-v2.
// The analytics engine (ADR-009) is not built, so those figures are SAMPLE DATA —
// kept exactly as designed and flagged by the "Sample data" banner (not stripped).
// Wiring connected:
//   • Team gate — non-Team plans get an upgrade screen; the sidebar also hides the
//     Analytics nav item off Team.
//   • "← Dashboard" → /user/dashboard · "All reqs →" → /user/pipelines
//   • the date-range toggle keeps its look and says "coming soon" on click.

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import useSWR from "swr";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { PreviewSidebar } from "../PreviewSidebar";

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

// ----- Types & seed data ----------------------------------------------------

type StageDatum = { stage: string; count: number; tone: string };
// ONE funnel, tracked per shortlisted candidate:
//   shortlisted (with rank + source) → selected for interview → cleared / failed.
// Shortlist quality = clear rate at depth cutoffs: cleared / selected within the
// top-10, and within the top-20. Comparing top-10 vs top-20 shows whether
// extending the list adds quality or dilutes. Stratifying by rank cutoff also
// holds POSITION BIAS ~constant (everyone in "top 10" was equally above the fold).
// The SAME funnel, sliced by `source` instead of rank, is the channel-strength
// metric below — so both tiles are powered by one interview-outcome table.
type ShortlistTier = { label: string; sub: string; passed: number; interviewed: number; tone: string };
// Channel strength = the SAME interview funnel as shortlist quality, sliced by
// `source` instead of rank. One intake link gets pasted across channels, so a
// single shortlist blends sources — every candidate is tagged to its channel at
// submission. Two signals per source:
//   top10Penetration = top10 / submissions  → rank-controlled, pure EigenWork
//     gate (no recruiter behavior), so it isolates the CHANNEL. Headline.
//   clearRate = cleared / selected           → human-validated confirmation.
// hires = ground-truth yield, shown as context.
type SourceRow = { name: string; submissions: number; top10: number; selected: number; cleared: number; hires: number };

// ----- KPI snapshot contract (ADR-009) --------------------------------------
// Declared LOCALLY (not imported) — this is the shared `kpi_snapshots/{orgId}`
// contract that `GET /api/kpi` returns as `{ snapshot: KpiSnapshot | null }`.
// When `snapshot == null` (engine not yet computed for this org) the page falls
// back to the sample figures below and shows the amber "Sample data" banner.
type Funnel = { selected: number; cleared: number; rate: number | null };
type KpiSnapshot = {
  orgId: string; computedAt: number; windowDays: number; period: string;
  timeToFill: { medianDays: number | null; hires: number; belowThreshold: boolean };
  rolesFilled: { hired: number; target: number | null };
  offerAcceptance: { accepted: number; extended: number; rate: number | null };
  inflatedProfiles: { count: number };
  pipelineByStage: { screening: number; interviewing: number; offer: number; hired: number; rejected: number; withdrawn: number; openReqs: number };
  shortlistQuality: { top10: Funnel; top20: Funnel; ranks11to20: Funnel };
  sources: Array<{ name: string; submissions: number; top10: number; selected: number; cleared: number; hires: number; top10Penetration: number; clearRate: number | null }>;
};

// ----- Sample fallback data -------------------------------------------------
// Verbatim from the v2 preview. Used ONLY when no live snapshot is present; the
// amber "Sample data" banner is shown in exactly that case.
const SAMPLE_STAGES: StageDatum[] = [
  { stage: "Sourced",     count: 12, tone: "bg-gray-400 dark:bg-gray-500" },
  { stage: "Screening",   count: 47, tone: "bg-sky-500" },
  { stage: "Interviewing", count: 19, tone: "bg-teal-500" },
  { stage: "Offers",      count:  4, tone: "bg-emerald-500" },
];

// passed = cleared interview, interviewed = selected for interview.
const SAMPLE_SHORTLIST_TIERS: ShortlistTier[] = [
  { label: "Top 10",      sub: "8 of 10 selected",  passed: 7, interviewed:  8, tone: "bg-teal-500" },
  { label: "Top 20",      sub: "12 of 20 selected", passed: 9, interviewed: 12, tone: "bg-emerald-500" },
  { label: "Ranks 11–20", sub: "4 selected",        passed: 2, interviewed:  4, tone: "bg-amber-500" },
];

const SAMPLE_SOURCES: SourceRow[] = [
  { name: "Referrals",                submissions:  41, top10:  9, selected: 7, cleared: 5, hires: 5 },
  { name: "Hacker News Who's Hiring", submissions:  84, top10: 14, selected: 10, cleared: 6, hires: 6 },
  { name: "LinkedIn (organic)",       submissions: 312, top10: 22, selected: 16, cleared: 7, hires: 9 },
  { name: "Company site",             submissions:  67, top10:  5, selected: 3, cleared: 1, hires: 2 },
  { name: "Indeed",                   submissions: 188, top10:  6, selected: 4, cleared: 1, hires: 2 },
];

// Stage tones/labels are preserved when mapping a live snapshot's
// pipelineByStage into the StageBars StageDatum[] shape.
function snapshotToStages(p: KpiSnapshot["pipelineByStage"]): StageDatum[] {
  return [
    { stage: "Screening",    count: p.screening,    tone: "bg-sky-500" },
    { stage: "Interviewing", count: p.interviewing, tone: "bg-teal-500" },
    { stage: "Offers",       count: p.offer,        tone: "bg-emerald-500" },
  ];
}

// shortlistQuality funnels → the existing ShortlistTier shape
// (passed = cleared, interviewed = selected). Tones/labels preserved.
function snapshotToShortlistTiers(q: KpiSnapshot["shortlistQuality"]): ShortlistTier[] {
  return [
    { label: "Top 10",      sub: `${q.top10.selected} selected`,      passed: q.top10.cleared,      interviewed: q.top10.selected,      tone: "bg-teal-500" },
    { label: "Top 20",      sub: `${q.top20.selected} selected`,      passed: q.top20.cleared,      interviewed: q.top20.selected,      tone: "bg-emerald-500" },
    { label: "Ranks 11–20", sub: `${q.ranks11to20.selected} selected`, passed: q.ranks11to20.cleared, interviewed: q.ranks11to20.selected, tone: "bg-amber-500" },
  ];
}

// sources → the existing SourceRow shape (top10Penetration / clearRate are
// recomputed inside SourceLeaderboard from these raw counts, as today).
function snapshotToSources(sources: KpiSnapshot["sources"]): SourceRow[] {
  return sources.map((s) => ({
    name: s.name,
    submissions: s.submissions,
    top10: s.top10,
    selected: s.selected,
    cleared: s.cleared,
    hires: s.hires,
  }));
}

const kpiFetcher = async (url: string): Promise<{ snapshot: KpiSnapshot | null }> => {
  const token = await getIdTokenOrNull();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error("kpi_fetch_failed");
  return res.json();
};

// ----- Page -----------------------------------------------------------------

export default function AnalyticsV2Page() {
  usePageTitle("Analytics");
  const router = useRouter();
  const [navCollapsed, setNavCollapsed] = useState(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace("/"); return; }
      setAuthChecking(false);
      setUserId(user.uid);
    });
    return () => unsub();
  }, [router]);
  const { entitlement, isLoading } = useDashboardData(userId);

  // Live KPI snapshot (ADR-009). `{ snapshot: KpiSnapshot | null }`; null until
  // the KPI engine has computed for this org → fall back to the sample figures.
  const { data: kpiData } = useSWR<{ snapshot: KpiSnapshot | null }>(
    userId ? "/api/kpi" : null,
    kpiFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      refreshInterval: 0,
      onError: (error) => console.error("Failed to fetch KPI snapshot:", error),
    }
  );
  const snapshot = kpiData?.snapshot ?? null;
  const usingSample = snapshot == null;

  if (authChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  // Team-gated surface (ADR-009): off-Team plans get an upgrade screen instead.
  const isTeam = entitlement?.plan === "team";
  if (!isTeam) {
    return (
      <div className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"}`}>
        <PreviewSidebar active="analytics" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-20 flex items-center justify-center">
          <div className="max-w-md w-full text-center bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06] rounded-2xl p-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-300 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 20V4M4 20h16M9 20v-6M14 20v-9M19 20v-4" /></svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Analytics is a Team feature</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Upgrade to the Team plan to unlock time-to-fill, offer acceptance, shortlist quality, and the source leaderboard.</p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button type="button" onClick={() => router.push("/user/billing")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200">Upgrade to Team</button>
              <button type="button" onClick={() => router.push("/user/dashboard")} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]">Back to dashboard</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----- Derived display values: live snapshot, else sample fallback --------
  // Headline tiles.
  const timeToFillDays = snapshot && !snapshot.timeToFill.belowThreshold ? snapshot.timeToFill.medianDays : null;
  const timeToFillDisplay = usingSample ? "18" : (timeToFillDays != null ? String(timeToFillDays) : "—");

  const rolesHired = usingSample ? 12 : (snapshot ? snapshot.rolesFilled.hired : 0);
  const rolesTarget = usingSample ? 16 : (snapshot ? snapshot.rolesFilled.target : null);
  const rolesPct = rolesTarget && rolesTarget > 0 ? Math.min(100, Math.round((rolesHired / rolesTarget) * 100)) : null;

  const offerRate = snapshot?.offerAcceptance.rate ?? null;
  const offerDisplay = usingSample ? "82" : (offerRate != null ? String(Math.round(offerRate)) : "—");

  const inflatedDisplay = usingSample ? "23" : String(snapshot ? snapshot.inflatedProfiles.count : 0);

  // Composite tiles.
  const stages = usingSample || !snapshot ? SAMPLE_STAGES : snapshotToStages(snapshot.pipelineByStage);
  const stagesTotal = stages.reduce((s, x) => s + x.count, 0);
  const openReqs = usingSample ? 4 : (snapshot ? snapshot.pipelineByStage.openReqs : 0);

  const shortlistTiers = usingSample || !snapshot ? SAMPLE_SHORTLIST_TIERS : snapshotToShortlistTiers(snapshot.shortlistQuality);
  const top10Funnel = snapshot?.shortlistQuality.top10 ?? null;
  const top10ClearDisplay = usingSample ? "88" : (top10Funnel?.rate != null ? String(Math.round(top10Funnel.rate)) : "—");
  // Sample preserves its original "50 shortlisted"; live sums the funnels' selected counts.
  const shortlistTotal = usingSample ? 50 : shortlistTiers.reduce((s, t) => s + t.interviewed, 0);

  const sources = usingSample || !snapshot ? SAMPLE_SOURCES : snapshotToSources(snapshot.sources);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="analytics" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Page header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Acme Talent · Team workspace
              </span>
              <span className="text-gray-300 dark:text-white/15">·</span>
              <span>Q3 2026 · Updated just now</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Analytics</h1>
              <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold tracking-wide bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">Team plan</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Every hiring metric your team runs on. Available on Team plan and above.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-md">
              {["7d", "30d", "Quarter", "YTD"].map((r, i) => (
                <button key={r} type="button" onClick={() => notifySoon("Date range")} className={`px-2.5 py-1 rounded text-xs font-medium ${i === 2 ? "bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>{r}</button>
              ))}
            </div>
            <a href="/user/dashboard" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
              ← Dashboard
            </a>
          </div>
        </div>
      </div>

      {/* Placeholder notice — shown only while falling back to sample data
          (no live KPI snapshot yet for this org). Hidden once live figures load. */}
      {usingSample && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/50">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-2.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <span className="shrink-0">⚠️</span>
            <span><span className="font-semibold">Sample data.</span> These analytics are placeholders until the KPI engine ships (ADR-009). The numbers below illustrate the design and are not your live figures.</span>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-10">
        {/* OPERATIONAL — full tile set */}
        <section>
          <SectionHeader
            eyebrow="Operational performance"
            title="Hiring performance this quarter"
            sub="The operational metrics your TA team runs on."
            badge={{ text: "Team plan", tone: "team" }}
          />

          <div className="grid grid-cols-12 gap-3">
            {/* Row 1 — 4 small tiles */}
            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="sky">
              <KpiLabel icon={<IconClock />}>Time-to-fill</KpiLabel>
              <KpiValue>{timeToFillDisplay}<span className="text-base font-normal text-gray-400 ml-1">days</span></KpiValue>
              {usingSample && <KpiDelta dir="down" good>−4d vs last quarter</KpiDelta>}
              {usingSample && <Sparkline values={[28, 26, 25, 27, 23, 21, 22, 19, 20, 18]} stroke="stroke-sky-500" />}
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconTarget />}>Roles filled vs target</KpiLabel>
              <KpiValue>{rolesHired}<span className="text-base font-normal text-gray-400 ml-1">/ {rolesTarget ?? "—"}</span></KpiValue>
              {rolesPct != null && <KpiDelta dir="up" good>{rolesPct}% of {snapshot?.period ?? "Q3"} target</KpiDelta>}
              <div className="mt-3 h-1.5 w-full bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rolesPct ?? 0}%` }} />
              </div>
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconCheckCircle />}>Offer acceptance rate</KpiLabel>
              <KpiValue>{offerDisplay}<span className="text-base font-normal text-gray-400 ml-0.5">%</span></KpiValue>
              {usingSample
                ? <KpiDelta dir="up" good>+6pp vs Q2 · 9 of 11 accepted</KpiDelta>
                : snapshot && snapshot.offerAcceptance.extended > 0 && (
                    <KpiDelta dir="up" good>{snapshot.offerAcceptance.accepted} of {snapshot.offerAcceptance.extended} accepted</KpiDelta>
                  )}
              {usingSample && <Sparkline values={[71, 70, 73, 76, 75, 78, 80, 79, 82]} stroke="stroke-emerald-500" />}
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="rose">
              <KpiLabel icon={<IconShield />}>Inflated profiles surfaced</KpiLabel>
              <KpiValue>{inflatedDisplay}<span className="text-base font-normal text-gray-400 ml-1">this month</span></KpiValue>
              {usingSample && <KpiDelta dir="up" good>+3 today</KpiDelta>}
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Repos built in a single day · résumés that don&apos;t match the work · commit patterns that don&apos;t add up.</p>
            </KpiTile>

            {/* Row 2 — wider tiles */}
            <KpiTile className="col-span-12 lg:col-span-7" accent="teal" padding="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <KpiLabel icon={<IconFunnel />}>Open reqs · pipeline by stage</KpiLabel>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{stagesTotal}<span className="text-base font-normal text-gray-400 ml-1.5">candidates across {openReqs} reqs</span></p>
                </div>
                <a href="/user/pipelines" className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline">All reqs →</a>
              </div>
              <StageBars stages={stages} />
            </KpiTile>

            <KpiTile className="col-span-12 lg:col-span-5" accent="emerald" padding="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <KpiLabel icon={<IconStack />}>Shortlist quality rate</KpiLabel>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{top10ClearDisplay}<span className="text-base font-normal text-gray-400 ml-0.5">%</span> <span className="text-sm font-medium text-gray-500 dark:text-gray-400">top-10 clear rate</span></p>
                  {usingSample
                    ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">7 of 8 selected from your top 10 cleared interview</p>
                    : top10Funnel && top10Funnel.selected > 0 && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">{top10Funnel.cleared} of {top10Funnel.selected} selected from your top 10 cleared interview</p>
                      )}
                </div>
                <span className="text-[10.5px] text-gray-500 dark:text-gray-400 font-medium text-right">{shortlistTotal} shortlisted<br />last 90 days</span>
              </div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">Interview-clear rate by shortlist depth</p>
              <ul className="space-y-2.5">
                {shortlistTiers.map((t) => <ShortlistTierRow key={t.label} t={t} />)}
              </ul>
              <p className="mt-3 text-[10.5px] text-gray-500 dark:text-gray-400 leading-snug">{usingSample ? "Top 20 clears at 75% vs 88% for the top 10 — the back half dilutes, so your value is the top 10. Slice this same funnel by source, not depth, and it becomes channel strength." : "Compare the top-10 clear rate with the top-20: when the back half clears lower, your value is concentrated in the top 10. Slice this same funnel by source, not depth, and it becomes channel strength."}</p>
            </KpiTile>

            {/* Row 3 — source leaderboard */}
            <KpiTile className="col-span-12" accent="emerald" padding="p-5">
              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                  <KpiLabel icon={<IconTrophy />}>Source quality leaderboard</KpiLabel>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">Channel strength · last 90 days — share of each source&apos;s applicants that reach a <span className="italic">top-10 shortlist</span>. Rank-controlled, so it&apos;s the channel, not your reading order; interview-clear rate confirms it. One intake link pastes anywhere, so each shortlist blends sources — every candidate is tagged to its channel.</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Ranked by top-10 reach</span>
                </div>
              </div>
              <SourceLeaderboard rows={sources} />
            </KpiTile>
          </div>
        </section>

      </div>
    </div>
  );
}

// ----- Section header -------------------------------------------------------

function SectionHeader({
  eyebrow,
  title,
  sub,
  badge,
  cta,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  badge?: { text: string; tone: "team" | "outcomes" };
  cta?: { label: string; href: string };
}) {
  const badgeClass = badge?.tone === "outcomes"
    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
    : "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300";
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-gray-500 dark:text-gray-400">{eyebrow}</p>
          {badge && <span className={`px-2 py-0.5 rounded text-[10.5px] font-semibold tracking-wide ${badgeClass}`}>{badge.text}</span>}
        </div>
        <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50 tracking-tight">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{sub}</p>
      </div>
      {cta && (
        <a href={cta.href} className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1">
          {cta.label} <IconArrowRight />
        </a>
      )}
    </div>
  );
}

// ----- KPI primitives -------------------------------------------------------

function KpiTile({
  className = "",
  accent = "sky",
  padding = "p-4",
  children,
}: {
  className?: string;
  accent?: "sky" | "emerald" | "amber" | "teal" | "rose";
  padding?: string;
  children: React.ReactNode;
}) {
  const rail = {
    sky: "before:bg-sky-500/70",
    emerald: "before:bg-emerald-500/70",
    amber: "before:bg-amber-500/70",
    teal: "before:bg-teal-500/70",
    rose: "before:bg-rose-500/70",
  }[accent];
  return (
    <div className={`relative bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200/80 dark:border-white/[0.06] ${padding} overflow-hidden before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r ${rail} ${className}`}>
      {children}
    </div>
  );
}

function KpiLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
      <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      {children}
    </p>
  );
}
function KpiValue({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{children}</p>;
}
function KpiDelta({ children, dir, good }: { children: React.ReactNode; dir: "up" | "down" | "flat"; good?: boolean }) {
  const color = good
    ? "text-emerald-600 dark:text-emerald-400"
    : dir === "down"
      ? "text-rose-600 dark:text-rose-400"
      : "text-gray-500 dark:text-gray-400";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
  return (
    <p className={`mt-1 text-[11px] ${color} inline-flex items-center gap-1`}>
      <span>{arrow}</span>
      <span>{children}</span>
    </p>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const w = 100;
  const h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full h-6" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={stroke} points={pts} />
    </svg>
  );
}

// ----- Stage bars -----------------------------------------------------------

function StageBars({ stages }: { stages: StageDatum[] }) {
  // `|| 1` guards an all-zero pipeline (a real empty-org snapshot): without it
  // every `count / max` is 0/0 = NaN, rendering `width: NaN%`.
  const max = Math.max(...stages.map((s) => s.count)) || 1;
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        return (
          <div key={s.stage} className="grid grid-cols-12 items-center gap-3">
            <div className="col-span-3 flex items-center gap-2 text-xs">
              <span className="text-gray-400 dark:text-gray-500 font-medium tabular-nums">{i + 1}</span>
              <span className="text-gray-700 dark:text-gray-200">{s.stage}</span>
            </div>
            <div className="col-span-7">
              <div className="w-full h-3 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.tone}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="col-span-2 text-right text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{s.count}</div>
          </div>
        );
      })}
    </div>
  );
}

// ----- Shortlist quality band row -------------------------------------------

function ShortlistTierRow({ t }: { t: ShortlistTier }) {
  // Guard interviewed === 0 (a live funnel tier with nobody selected): without it
  // `passed / interviewed` is NaN, rendering "NaN%" and `width: NaN%`.
  const pct = t.interviewed > 0 ? Math.round((t.passed / t.interviewed) * 100) : 0;
  return (
    <li className="grid grid-cols-12 items-center gap-3">
      <div className="col-span-4 min-w-0">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{t.label}</p>
        <p className="text-[10.5px] text-gray-500 dark:text-gray-400">{t.sub}</p>
      </div>
      <div className="col-span-5">
        <div className="w-full h-2 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${t.tone}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="col-span-3 text-right">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{pct}%</span>
        <span className="text-[10.5px] text-gray-500 dark:text-gray-400 ml-1 tabular-nums">{t.passed}/{t.interviewed}</span>
      </div>
    </li>
  );
}

// ----- Source leaderboard ---------------------------------------------------

function SourceLeaderboard({ rows }: { rows: SourceRow[] }) {
  // Headline = top-10 penetration (top10 / submissions): rank-controlled, no
  // recruiter behavior, so it isolates the channel. clearRate (cleared/selected)
  // is the human-validated confirmation shown alongside.
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
        const textTone = pen >= 18 ? "text-teal-600 dark:text-teal-400" : pen >= 10 ? "text-emerald-600 dark:text-emerald-400" : pen >= 5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
        return (
          <li key={s.name} className="grid grid-cols-12 items-center gap-3">
            <div className="col-span-1 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 tabular-nums">#{i + 1}</div>
            <div className="col-span-4 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                {s.hires} hires · {s.submissions} subs
                <span className="text-gray-400 dark:text-gray-500"> · {clearOf(s)}% interview-clear</span>
              </p>
            </div>
            <div className="col-span-5">
              <div className="w-full h-2 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="col-span-2 text-right">
              <span className={`text-base font-semibold tabular-nums ${textTone}`}>{Math.round(pen)}%</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">top-10</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ----- Icons ----------------------------------------------------------------

const I = "w-3.5 h-3.5";

function IconClock() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconTarget() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>; }
function IconCheckCircle() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconShield() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.6-3.4A12 12 0 0112 2a12 12 0 01-8.6 4.6L3 7v5a9 9 0 009 9 9 9 0 009-9V7z" /></svg>; }
function IconFunnel() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18l-7 8v6l-4 2v-8L3 4z" /></svg>; }
function IconStack() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11l-7-7-7 7m14 0v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6m14 0H5" /></svg>; }
function IconTrophy() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8m-4 0v-4m6-13H6v6a6 6 0 0012 0V4zm0 0h3v2a3 3 0 01-3 3M6 4H3v2a3 3 0 003 3" /></svg>; }
function IconArrowRight() { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>; }
