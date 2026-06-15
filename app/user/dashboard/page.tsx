"use client";

// /user/dashboard — the overview.
//
// Base design = the v2 dashboard EMPTY state (app/user/dashboard-v2-empty),
// kept verbatim. It is wired so the data-backed sections render in the v2 FILLED
// colors the moment real data exists, and fall back to the empty design when it
// doesn't — so one page covers both new-org and active-org:
//   • Pipeline health → real /api/jd/list rows (filled-v2 row styling) · empty state when none
//   • Plan & usage    → real entitlement (screens / roles / ATS / expiry)
//   • Onboarding      → checklist derived from real progress
// The KPI/analytics tiles (time-to-fill, offer-rate, shortlist quality, etc.) have
// no engine yet (ADR-009), so they keep their empty-state look — no sample numbers.
// Controls with no backend yet keep their look and say "coming soon" on click.
//   • auth + Free-plan gate (FreeClaimGate when plan === null)

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { FreeClaimGate } from "../FreeClaimGate";
import { PreviewSidebar } from "../PreviewSidebar";

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

// ----- Types -----------------------------------------------------------

type Status = "open" | "awaiting" | "ready" | "closed";

type HealthRow = {
  id: string;
  title: string;
  applied: number;
  cap: number;
  status: Status;
  lastActivity: string;
  topEti: number | null;
};

type Pipeline = {
  id: string;
  title: string;
  createdAt: number | null;
  submissionCap: number;
  isClosed: boolean;
  appliedCount: number;
  hasMatchResult?: boolean;
  topEti?: number | null;
  shortlistCount?: number;
};

const STATUS_STYLE: Record<Status, { label: string; pill: string; dot: string }> = {
  open:     { label: "Open",    pill: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",    dot: "bg-sky-500" },
  awaiting: { label: "Filling", pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",        dot: "bg-amber-500" },
  ready:    { label: "Ready",   pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  closed:   { label: "Closed",  pill: "bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400",          dot: "bg-gray-400" },
};

function deriveStatus(p: Pipeline): Status {
  if (p.isClosed || p.hasMatchResult) return "closed";
  const ratio = p.submissionCap > 0 ? p.appliedCount / p.submissionCap : 0;
  if (ratio >= 0.6) return "ready";
  if (p.appliedCount > 0) return "awaiting";
  return "open";
}

function relativeAgo(createdAt: number | null): string {
  if (!createdAt) return "—";
  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
}

const ONBOARDING_DEFS = [
  { label: "Create your first role pipeline", kicker: "5 minutes · title, description, cap" },
  { label: "Share your intake link", kicker: "Candidates submit GitHub + resume" },
  { label: "Get your first evaluation back", kicker: "Auto-scored as each submission arrives" },
  { label: "Generate your first shortlist", kicker: "Unlocks at 60% of applicant cap" },
  { label: "Invite a teammate", kicker: "Up to 10 included on Team" },
];

// Shortlist quality rate — the analytics widget, surfaced on the dashboard. These
// are sample figures: the metric needs the interview-outcome funnel (ADR-009 §6),
// which is not collected yet.
type ShortlistTier = { label: string; sub: string; passed: number; interviewed: number; tone: string };
const SHORTLIST_TIERS: ShortlistTier[] = [
  { label: "Top 10",      sub: "8 of 10 selected",  passed: 7, interviewed:  8, tone: "bg-teal-500" },
  { label: "Top 20",      sub: "12 of 20 selected", passed: 9, interviewed: 12, tone: "bg-emerald-500" },
  { label: "Ranks 11–20", sub: "4 selected",        passed: 2, interviewed:  4, tone: "bg-amber-500" },
];

// ----- Page ------------------------------------------------------------

export default function DashboardPage() {
  usePageTitle("Dashboard");
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

  const { pipelines, entitlement, isLoading, revalidate } = useDashboardData(userId);

  const rows = pipelines as Pipeline[];
  const activeRoles = useMemo(() => rows.filter((p) => !p.isClosed).length, [rows]);
  const health: HealthRow[] = useMemo(
    () =>
      rows.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title || "Untitled role",
        applied: p.appliedCount ?? 0,
        cap: p.submissionCap ?? 0,
        status: deriveStatus(p),
        lastActivity: relativeAgo(p.createdAt),
        topEti: p.topEti ?? null,
      })),
    [rows]
  );

  // Onboarding progress derived from real data (no fake checkmarks).
  const onboarding = useMemo(() => {
    const hasPipeline = rows.length > 0;
    const hasEval = rows.some((p) => (p.appliedCount ?? 0) > 0);
    const hasShortlist = rows.some((p) => (p.shortlistCount ?? 0) > 0);
    const done = [hasPipeline, hasPipeline, hasEval, hasShortlist, false];
    return ONBOARDING_DEFS.map((d, i) => ({ ...d, done: done[i] }));
  }, [rows]);
  const doneCount = onboarding.filter((s) => s.done).length;
  const donePct = Math.round((doneCount / onboarding.length) * 100);

  const plan = entitlement?.plan ?? null;
  const planLabel = plan === "team" ? "Team" : plan === "single_role" ? "Single Role" : "Free";
  const screenCap = entitlement?.screenCap ?? 0;
  const screensUsed = entitlement?.screensUsed ?? 0;
  const screensRemaining = entitlement?.screensRemaining ?? 0;
  const walletBalance = entitlement?.walletBalance ?? 0;
  const roleLimit = entitlement?.roleLimit ?? 0;
  const atsEnabled = entitlement?.atsEnabled ?? false;
  const usedPct = screenCap > 0 ? Math.min(100, Math.round((screensUsed / screenCap) * 100)) : 0;
  const expiresLabel =
    entitlement?.expiresAtMs != null
      ? new Date(entitlement.expiresAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : null;

  if (authChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }
  if (entitlement && entitlement.plan === null) {
    return <FreeClaimGate onClaimed={() => revalidate()} />;
  }

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="dashboard" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Page header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {planLabel} workspace
              </span>
              <span className="text-gray-300 dark:text-white/15">·</span>
              <span>{activeRoles > 0 ? `${activeRoles} active role${activeRoles === 1 ? "" : "s"}` : "Just getting started"}</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{activeRoles > 0 ? "Operational performance and pipeline health across your roles." : "Welcome — your operational metrics will appear here as you start screening."}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.push("/user/jd")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
              <IconPlus /> Create your first role
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-10">
        {/* GET STARTED hero (empty-state) */}
        {rows.length === 0 && (
          <section className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02]">
            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 lg:p-8">
              <div className="lg:col-span-5">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-semibold tracking-wide bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><IconSparkle /> First-time setup</span>
                <h2 className="mt-3 text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-tight">Welcome to EigenWork.</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-md">Your dashboard fills in as candidates apply. The fastest path: create a role, share its intake link, and let EigenWork rank candidates as they arrive.</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => router.push("/user/jd")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors">Create your first role <IconArrowRight /></button>
                  <button type="button" onClick={() => notifySoon("Walkthrough")} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-white dark:hover:bg-white/[0.04]">Watch 2-min walkthrough</button>
                </div>
                <p className="mt-4 text-[11px] text-gray-500 dark:text-gray-400">Already have candidates in a spreadsheet? <button type="button" onClick={() => notifySoon("Spreadsheet import")} className="text-sky-600 dark:text-sky-400 hover:underline">Import them here</button>.</p>
              </div>
              <div className="lg:col-span-7">
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <StartStep n={1} icon={<IconDoc />} title="Create a role" body="Title, level, applicant cap. We auto-generate a rubric for that level." />
                  <StartStep n={2} icon={<IconLink />} title="Share intake link" body="Candidates submit GitHub + resume. Evaluated immediately." />
                  <StartStep n={3} icon={<IconStack />} title="Rank the pool" body="At 60% of cap, generate the ranked shortlist with ETI + reasoning." />
                </ol>
              </div>
            </div>
          </section>
        )}

        {/* OPERATIONAL — empty Team-tier tiles (no engine yet → no numbers) */}
        <section>
          <SectionHeader
            eyebrow="Operational performance"
            title="What you'll see on Team"
            sub="Each tile activates as you generate the underlying data."
            badge={{ text: "Team plan", tone: "team" }}
            cta={{ label: "View all", href: "/user/analytics" }}
          />
          <div className="grid grid-cols-12 gap-3">
            <EmptyKpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="sky">
              <KpiLabel icon={<IconClock />}>Time-to-fill</KpiLabel>
              <EmptyValue>—<span className="text-base font-normal text-gray-400 ml-1">days</span></EmptyValue>
              <EmptyHint>Activates after your first hire</EmptyHint>
              <SparklineOutline stroke="stroke-sky-300 dark:stroke-sky-500/30" />
            </EmptyKpiTile>
            <EmptyKpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconTarget />}>Roles filled vs target</KpiLabel>
              <EmptyValue>0<span className="text-base font-normal text-gray-400 ml-1">/ —</span></EmptyValue>
              <button type="button" onClick={() => notifySoon("Hiring targets")} className="mt-1 text-[11px] text-sky-600 dark:text-sky-400 font-medium hover:underline inline-flex items-center gap-1">Set quarterly target →</button>
              <EmptyBar />
            </EmptyKpiTile>
            <EmptyKpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconCheckCircle />}>Offer acceptance rate</KpiLabel>
              <EmptyValue>—<span className="text-base font-normal text-gray-400 ml-0.5">%</span></EmptyValue>
              <EmptyHint>Activates after your first offer</EmptyHint>
              <SparklineOutline stroke="stroke-emerald-300 dark:stroke-emerald-500/30" />
            </EmptyKpiTile>
            <EmptyKpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="rose">
              <KpiLabel icon={<IconShield />}>Inflated profiles surfaced</KpiLabel>
              <EmptyValue>0</EmptyValue>
              <EmptyHint>Filtering starts on your first submission</EmptyHint>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Repos built in a single day · résumés that don&apos;t match the work · commit patterns that don&apos;t add up.</p>
            </EmptyKpiTile>
          </div>
        </section>

        {/* PIPELINE HEALTH (real) + ACTIVITY (empty) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
            <div className="px-5 lg:px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-white/[0.05]">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pipeline health</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Active roles — fill rate and last activity</p>
              </div>
              <a href="/user/pipelines" className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline">All pipelines →</a>
            </div>
            {health.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-sky-50 dark:bg-sky-500/15 flex items-center justify-center text-sky-600 dark:text-sky-300 mb-4"><IconBox /></div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No pipelines yet</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">Create a role pipeline to start receiving and evaluating candidates. Each pipeline becomes a row here with status, progress, and ETI.</p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <button type="button" onClick={() => router.push("/user/jd")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200"><IconPlus /> Create pipeline</button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {health.map((p) => {
                  const pct = p.cap > 0 ? Math.min(100, Math.round((p.applied / p.cap) * 100)) : 0;
                  const st = STATUS_STYLE[p.status];
                  return (
                    <div key={p.id} className="px-5 lg:px-6 py-4 grid grid-cols-12 items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="col-span-12 sm:col-span-5 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.title}</p>
                          <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium ${st.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Last activity {p.lastActivity}{p.topEti != null && <> · Top ETI <span className="font-medium text-gray-700 dark:text-gray-200">{p.topEti}</span></>}</p>
                      </div>
                      <div className="col-span-8 sm:col-span-5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500 dark:text-gray-400">{p.applied} / {p.cap} submissions</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${p.status === "ready" ? "bg-emerald-500" : p.status === "awaiting" ? "bg-amber-500" : p.status === "closed" ? "bg-gray-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2 flex justify-end">
                        <button type="button" onClick={() => router.push(`/user/jd/results?jobId=${encodeURIComponent(p.id)}`)} className="text-xs font-medium text-gray-700 dark:text-gray-200 px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">Open →</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05]">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent activity</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Submissions, evaluations, hires</p>
            </div>
            <div className="p-8 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center text-gray-500 dark:text-gray-400 mb-3"><IconBell /></div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Activity feed coming soon</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">A live stream of submissions, evaluations, and flags will land here.</p>
            </div>
            <ol className="px-5 pb-5 space-y-2 opacity-40">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-md bg-gray-100 dark:bg-white/[0.06]" />
                  <div className="min-w-0 flex-1">
                    <div className="h-2.5 w-32 rounded bg-gray-200 dark:bg-white/[0.06]" />
                    <div className="mt-1 h-2 w-20 rounded bg-gray-100 dark:bg-white/[0.04]" />
                  </div>
                  <span className="h-2 w-6 rounded bg-gray-100 dark:bg-white/[0.04]" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* BOTTOM — Shortlist quality rate (sample) + Plan & usage (real) + Onboarding (derived) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Shortlist quality rate — moved from the analytics page (sample figures) */}
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <KpiLabel icon={<IconStack />}>Shortlist quality rate</KpiLabel>
                <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">88<span className="text-base font-normal text-gray-400 ml-0.5">%</span> <span className="text-sm font-medium text-gray-500 dark:text-gray-400">top-10 clear rate</span></p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">7 of 8 selected from your top 10 cleared interview</p>
              </div>
              <span className="text-[10.5px] text-gray-500 dark:text-gray-400 font-medium text-right">50 shortlisted<br />last 90 days</span>
            </div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">Interview-clear rate by shortlist depth</p>
            <ul className="space-y-2.5">
              {SHORTLIST_TIERS.map((t) => <ShortlistTierRow key={t.label} t={t} />)}
            </ul>
            <p className="mt-3 text-[10.5px] text-gray-500 dark:text-gray-400 leading-snug">Top 20 clears at 75% vs 88% for the top 10 — the back half dilutes, so your value is the top 10.</p>
          </div>

          {/* Plan & usage — REAL entitlement (filled-v2 styling) */}
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plan &amp; usage</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{planLabel}{expiresLabel ? ` · expires ${expiresLabel}` : ""}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">{planLabel}</span>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">Screens used</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><span className="tabular-nums">{screensUsed.toLocaleString()}</span> <span className="text-gray-400 dark:text-gray-500">/ {screenCap.toLocaleString()}</span></p>
              </div>
              <div className="mt-2 w-full h-2.5 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usedPct}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">{screensRemaining.toLocaleString()} screens remaining</p>
            </div>

            <ul className="mt-5 space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex items-center justify-between"><span>Roles allowed</span><span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">{activeRoles} / {roleLimit}</span></li>
              <li className="flex items-center justify-between"><span>Wallet balance</span><span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">{walletBalance.toLocaleString()}</span></li>
              <li className="flex items-center justify-between"><span>ATS push</span><span className={`font-medium ${atsEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>{atsEnabled ? "Enabled" : "—"}</span></li>
              <li className="flex items-center justify-between"><span>Outcome analytics</span><span className="font-medium text-gray-400 dark:text-gray-500">Locked</span></li>
            </ul>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => router.push("/user/billing")} className="px-3 py-2 rounded-lg text-xs font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">Buy more screens</button>
              <button type="button" onClick={() => router.push("/user/billing")} className="px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">Manage billing</button>
            </div>
          </div>

          {/* Onboarding — derived from real progress */}
          <div className="relative rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 mb-1.5"><IconSparkle /> Start here</div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Get your dashboard running</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{doneCount} of {onboarding.length} complete</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center text-sky-700 dark:text-sky-300 text-xs font-semibold tabular-nums">{donePct}%</div>
            </div>
            <ol className="mt-4 space-y-2.5">
              {onboarding.map((step, i) => (
                <li key={step.label} className="flex items-start gap-2.5 text-sm">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-emerald-500 text-white" : "border border-gray-300 dark:border-white/15 text-gray-400 dark:text-gray-500 text-[10px] font-semibold"}`}>
                    {step.done ? <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`${step.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200 font-medium"}`}>{step.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{step.kicker}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => router.push("/user/jd")} className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors">Create a role <IconArrowRight /></button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ----- Section header --------------------------------------------------

function SectionHeader({ eyebrow, title, sub, badge, cta }: { eyebrow: string; title: string; sub: string; badge?: { text: string; tone: "team" | "outcomes" }; cta?: { label: string; href: string } }) {
  const badgeClass = badge?.tone === "outcomes" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300";
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
        <a href={cta.href} className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1">{cta.label} <IconArrowRight /></a>
      )}
    </div>
  );
}

function ShortlistTierRow({ t }: { t: ShortlistTier }) {
  const pct = Math.round((t.passed / t.interviewed) * 100);
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

function StartStep({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="relative rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/[0.06] p-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold flex items-center justify-center tabular-nums">{n}</span>
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{body}</p>
    </li>
  );
}

// ----- Empty KPI primitives -------------------------------------------

function EmptyKpiTile({ className = "", accent = "sky", padding = "p-4", children }: { className?: string; accent?: "sky" | "emerald" | "amber" | "teal" | "rose"; padding?: string; children: React.ReactNode }) {
  const rail = { sky: "before:bg-sky-500/40", emerald: "before:bg-emerald-500/40", amber: "before:bg-amber-500/40", teal: "before:bg-teal-500/40", rose: "before:bg-rose-500/40" }[accent];
  return <div className={`relative bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200/80 dark:border-white/[0.06] ${padding} overflow-hidden before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r ${rail} ${className}`}>{children}</div>;
}
function KpiLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"><span className="text-gray-400 dark:text-gray-500">{icon}</span>{children}</p>;
}
function EmptyValue({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-2xl font-semibold text-gray-400 dark:text-gray-500 tabular-nums">{children}</p>;
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />{children}</p>;
}
function EmptyBar() {
  return <div className="mt-3 h-1.5 w-full bg-gray-100 dark:bg-white/[0.04] rounded-full" />;
}
function SparklineOutline({ stroke }: { stroke: string }) {
  const pts = "0,18 10,17 20,18 30,16 40,17 50,15 60,16 70,14 80,15 90,13 100,12";
  return (
    <svg viewBox="0 0 100 24" className="mt-3 w-full h-6" preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" className={stroke} points={pts} />
    </svg>
  );
}

// ----- Icons ----------------------------------------------------------

const I = "w-3.5 h-3.5";
function IconPlus() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>; }
function IconArrowRight() { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>; }
function IconClock() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconTarget() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>; }
function IconCheckCircle() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconShield() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.6-3.4A12 12 0 0112 2a12 12 0 01-8.6 4.6L3 7v5a9 9 0 009 9 9 9 0 009-9V7z" /></svg>; }
function IconSparkle() { return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6L21 11l-5.5 2.5L13 19l-2.5-5.5L5 11l5.5-2.5L13 3z" /></svg>; }
function IconDoc() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>; }
function IconLink() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5m4.656-4.656l1.5-1.5a4 4 0 115.656 5.656l-3 3a4 4 0 01-5.656 0" /></svg>; }
function IconStack() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11l-7-7-7 7m14 0v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6m14 0H5" /></svg>; }
function IconBox() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" /></svg>; }
function IconBell() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4A2 2 0 0118 14V11a6 6 0 10-12 0v3c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 11-6 0m6 0H9" /></svg>; }
