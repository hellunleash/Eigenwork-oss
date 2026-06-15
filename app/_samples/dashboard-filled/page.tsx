"use client";

// PARKED SAMPLE — the filled v2 dashboard (sample/seeded figures), kept verbatim
// for later adversarial use. It lives under app/_samples/, a Next.js private
// folder (underscore prefix), so it is NOT a route — the live overview at
// /user/dashboard is the empty design wired to real data. Restore this file into
// a routed folder when the adversarial scenario is needed.

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { FreeClaimGate } from "@/app/user/FreeClaimGate";
import { PreviewSidebar } from "@/app/user/PreviewSidebar";

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

// ----- Types -----------------------------------------------------------

type Status = "draft" | "open" | "awaiting" | "ready" | "closed";

type PipelineSummary = {
  id: string;
  title: string;
  applied: number;
  cap: number;
  status: Status;
  lastActivity: string;
  topEti: number | null;
};

type ActivityItem = {
  id: string;
  kind: "submission" | "evaluation" | "shortlist" | "pipeline_closed" | "member" | "flag" | "credit";
  text: string;
  meta?: string;
  time: string;
  tone: "neutral" | "good" | "warn" | "bad";
};

type StageDatum = { stage: string; count: number; tone: string };

// ----- Seed data -------------------------------------------------------

const PIPELINES: PipelineSummary[] = [
  { id: "p1", title: "Senior Backend Engineer", applied: 47, cap: 50, status: "ready",    lastActivity: "2h ago",  topEti: 82 },
  { id: "p2", title: "Full-Stack Engineer (Growth)", applied: 38, cap: 50, status: "open", lastActivity: "12m ago", topEti: 74 },
  { id: "p3", title: "Data Engineer",        applied: 28, cap: 40, status: "open",     lastActivity: "1d ago",  topEti: 71 },
  { id: "p4", title: "iOS Engineer",         applied: 22, cap: 40, status: "awaiting", lastActivity: "4h ago",  topEti: 68 },
  { id: "p5", title: "DevOps Engineer",      applied:  8, cap: 30, status: "awaiting", lastActivity: "1d ago",  topEti: null },
];

const ACTIVITY: ActivityItem[] = [
  { id: "a1", kind: "submission", text: "New submission", meta: "Maya R. → Senior Backend Engineer", time: "2m", tone: "neutral" },
  { id: "a2", kind: "evaluation", text: "Evaluation complete", meta: "Aditya P. · ETI 76", time: "12m", tone: "good" },
  { id: "a3", kind: "shortlist", text: "Shortlist generated", meta: "Senior Backend Engineer · 12 finalists", time: "1h", tone: "good" },
  { id: "a4", kind: "flag", text: "Profile flagged for review", meta: "Vikram S. · single-day repo", time: "4h", tone: "bad" },
  { id: "a5", kind: "evaluation", text: "Evaluation complete", meta: "abhay2 · ETI 58 · review needed", time: "5h", tone: "warn" },
  { id: "a6", kind: "pipeline_closed", text: "Pipeline closed", meta: "Mobile Engineer (Android)", time: "8h", tone: "neutral" },
  { id: "a7", kind: "member", text: "Teammate added", meta: "priya@acme.co", time: "12h", tone: "neutral" },
  { id: "a8", kind: "credit", text: "Credits added", meta: "+50 screens", time: "1d", tone: "good" },
];

const ACTIVITY_BARS = [3, 8, 5, 11, 7, 14, 9, 12, 6, 18, 11, 9, 15, 12];

const STAGES: StageDatum[] = [
  { stage: "Sourced",     count: 12, tone: "bg-gray-400 dark:bg-gray-500" },
  { stage: "Screening",   count: 47, tone: "bg-sky-500" },
  { stage: "Interviewing", count: 19, tone: "bg-teal-500" },
  { stage: "Offers",      count:  4, tone: "bg-emerald-500" },
];

const ETI_BUCKETS = [
  { label: "Top",       range: "80+",  count:  6, color: "text-teal-700 dark:text-teal-300",       bar: "bg-teal-500" },
  { label: "Strong",    range: "65–79", count: 32, color: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  { label: "Promising", range: "50–64", count: 66, color: "text-amber-700 dark:text-amber-300",     bar: "bg-amber-500" },
  { label: "Below bar", range: "<50",   count: 38, color: "text-rose-700 dark:text-rose-300",       bar: "bg-rose-500" },
];

const ONBOARDING = [
  { label: "Create your first pipeline", done: true },
  { label: "Share an intake link", done: true },
  { label: "Get first evaluation back", done: true },
  { label: "Generate first shortlist", done: false },
  { label: "Invite a teammate", done: false },
];

const STATUS_STYLE: Record<Status, { label: string; pill: string; dot: string }> = {
  draft:    { label: "Draft",   pill: "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300",          dot: "bg-gray-400" },
  open:     { label: "Open",    pill: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",    dot: "bg-sky-500" },
  awaiting: { label: "Filling", pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",        dot: "bg-amber-500" },
  ready:    { label: "Ready",   pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  closed:   { label: "Closed",  pill: "bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400",          dot: "bg-gray-400" },
};

// ----- Page ------------------------------------------------------------

// The modern preview sidebar lives in app/user/PreviewSidebar.tsx (shared across
// the v2 dashboard / pipeline preview pages).

export default function DashboardV2Page() {
  usePageTitle("Dashboard");
  const router = useRouter();
  const [tab] = useState<"overview">("overview");
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
  const { entitlement, isLoading, revalidate } = useDashboardData(userId);

  const totals = useMemo(() => {
    const open = PIPELINES.filter((p) => p.status !== "closed").length;
    const submissions = PIPELINES.reduce((s, p) => s + p.applied, 0);
    return { open, submissions };
  }, []);

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
                Acme Talent · Team workspace
              </span>
              <span className="text-gray-300 dark:text-white/15">·</span>
              <span>Q3 2026 · Updated just now</span>
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Operational performance and pipeline health across {totals.open} active roles.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-md">
              {["7d", "30d", "Quarter", "YTD"].map((r, i) => (
                <button key={r} type="button" onClick={() => notifySoon("Date range")} className={`px-2.5 py-1 rounded text-xs font-medium ${i === 2 ? "bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>{r}</button>
              ))}
            </div>
            <button type="button" onClick={() => notifySoon("Export")} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
              <IconDownload /> Export
            </button>
            <button type="button" onClick={() => router.push("/user/jd")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
              <IconPlus /> New role
            </button>
          </div>
        </div>
      </div>

      {/* Placeholder notice — the KPI/analytics engine (ADR-009) is not built, so
          the metrics below are sample data kept verbatim from the design. */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/50">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-2.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <span className="shrink-0">⚠️</span>
          <span><span className="font-semibold">Sample data.</span> The figures on this dashboard are placeholders until the analytics engine ships (ADR-009). Your live roles and billing are real on the Role pipelines and Billing pages.</span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-10">
        {/* ===================================================================
            OPERATIONAL — Team tier (7 tiles)
            =================================================================== */}
        <section>
          <SectionHeader
            eyebrow="Operational performance"
            title="Hiring performance this quarter"
            sub="The operational metrics your TA team runs on."
            badge={{ text: "Team plan", tone: "team" }}
            cta={{ label: "View all", href: "/user/analytics" }}
          />

          <div className="grid grid-cols-12 gap-3">
            {/* Row 1 — 4 small tiles */}
            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="sky">
              <KpiLabel icon={<IconClock />}>Time-to-fill</KpiLabel>
              <KpiValue>18<span className="text-base font-normal text-gray-400 ml-1">days</span></KpiValue>
              <KpiDelta dir="down" good>−4d vs last quarter</KpiDelta>
              <Sparkline values={[28, 26, 25, 27, 23, 21, 22, 19, 20, 18]} stroke="stroke-sky-500" />
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconTarget />}>Roles filled vs target</KpiLabel>
              <KpiValue>12<span className="text-base font-normal text-gray-400 ml-1">/ 16</span></KpiValue>
              <KpiDelta dir="up" good>75% of Q3 target</KpiDelta>
              <div className="mt-3 h-1.5 w-full bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "75%" }} />
              </div>
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="emerald">
              <KpiLabel icon={<IconCheckCircle />}>Offer acceptance rate</KpiLabel>
              <KpiValue>82<span className="text-base font-normal text-gray-400 ml-0.5">%</span></KpiValue>
              <KpiDelta dir="up" good>+6pp vs Q2 · 9 of 11 accepted</KpiDelta>
              <Sparkline values={[71, 70, 73, 76, 75, 78, 80, 79, 82]} stroke="stroke-emerald-500" />
            </KpiTile>

            <KpiTile className="col-span-12 sm:col-span-6 lg:col-span-3" accent="rose">
              <KpiLabel icon={<IconShield />}>Inflated profiles surfaced</KpiLabel>
              <KpiValue>23<span className="text-base font-normal text-gray-400 ml-1">this month</span></KpiValue>
              <KpiDelta dir="up" good>+3 today</KpiDelta>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Repos built in a single day · résumés that don&apos;t match the work · commit patterns that don&apos;t add up.</p>
            </KpiTile>

          </div>
        </section>

        {/* ===================================================================
            PIPELINE HEALTH + ACTIVITY FEED
            =================================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
            <div className="px-5 lg:px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-white/[0.05]">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pipeline health</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Active roles — fill rate and last activity</p>
              </div>
              <a href="/user/pipelines" className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline">All pipelines →</a>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {PIPELINES.slice(0, 5).map((p) => {
                const pct = Math.min(100, Math.round((p.applied / p.cap) * 100));
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
                        <div className={`h-full rounded-full ${p.status === "ready" ? "bg-emerald-500" : p.status === "awaiting" ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-2 flex justify-end">
                      <button type="button" onClick={() => router.push("/user/pipelines")} className="text-xs font-medium text-gray-700 dark:text-gray-200 px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                        Open →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-white/[0.05]">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent activity</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Across all pipelines</p>
              </div>
              <button type="button" onClick={() => notifySoon("Activity feed")} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">View all</button>
            </div>
            <ol className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {ACTIVITY.map((a) => (
                <li key={a.id} className="px-5 py-3.5 flex items-start gap-3">
                  <ActivityIcon kind={a.kind} tone={a.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-snug">{a.text}</p>
                    {a.meta && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.meta}</p>}
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 tabular-nums">{a.time}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ===================================================================
            BOTTOM — admin row
            =================================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ETI distribution */}
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Shortlist quality</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">ETI distribution this month · 142 evaluated</p>
              </div>
              <span className="text-[11px] text-gray-400">Higher is stronger</span>
            </div>
            <div className="space-y-3 mt-4">
              {ETI_BUCKETS.map((b) => {
                const max = Math.max(...ETI_BUCKETS.map((x) => x.count));
                const pct = Math.round((b.count / max) * 100);
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium ${b.color}`}>{b.label} <span className="opacity-60 font-normal">· {b.range}</span></span>
                      <span className="text-gray-500 dark:text-gray-400 tabular-nums">{b.count}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plan & usage */}
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plan & usage</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Team · expires Oct 12, 2026</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300">Team</span>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">Screens used</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><span className="tabular-nums">87</span> <span className="text-gray-400 dark:text-gray-500">/ 300</span></p>
              </div>
              <div className="mt-2 w-full h-2.5 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: "29%" }} />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">213 screens remaining · resets on renewal</p>
            </div>

            <ul className="mt-5 space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex items-center justify-between"><span>Roles allowed</span><span className="font-medium text-gray-900 dark:text-gray-100">8 / 10</span></li>
              <li className="flex items-center justify-between"><span>Team members</span><span className="font-medium text-gray-900 dark:text-gray-100">4 / 10</span></li>
              <li className="flex items-center justify-between"><span>ATS push</span><span className="font-medium text-emerald-600 dark:text-emerald-400">Enabled</span></li>
              <li className="flex items-center justify-between"><span>Outcome analytics</span><span className="font-medium text-gray-400 dark:text-gray-500">Locked</span></li>
            </ul>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => router.push("/user/billing")} className="px-3 py-2 rounded-lg text-xs font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">Buy more screens</button>
              <button type="button" onClick={() => router.push("/user/billing")} className="px-3 py-2 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">Manage billing</button>
            </div>
          </div>

          {/* Onboarding */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Get the most out of EigenWork</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">3 of 5 complete</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center text-sky-700 dark:text-sky-300 text-xs font-semibold tabular-nums">60%</div>
            </div>
            <ol className="mt-4 space-y-2">
              {ONBOARDING.map((step) => (
                <li key={step.label} className="flex items-center gap-2.5 text-sm">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-emerald-500 text-white" : "border border-gray-300 dark:border-white/15 text-transparent"}`}>
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span className={`${step.done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200"}`}>{step.label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 p-3 rounded-lg bg-white/70 dark:bg-white/[0.04] border border-sky-100/60 dark:border-sky-500/15">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300">Coming soon</p>
              <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">Install the EigenWork agent in your ATS — auto-screen on every new candidate.</p>
              <button type="button" onClick={() => notifySoon("ATS agent waitlist")} className="mt-2.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline">Get on the waitlist →</button>
            </div>
          </div>
        </section>

        <div className="hidden">{tab}</div>
      </div>
    </div>
  );
}

// ----- Section header -------------------------------------------------

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

// ----- KPI primitives -------------------------------------------------

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

// ----- Stage bars (Open reqs by stage) --------------------------------

function StageBars({ stages }: { stages: StageDatum[] }) {
  const max = Math.max(...stages.map((s) => s.count));
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

// ----- Activity chart -------------------------------------------------

function ActivityChart({ bars }: { bars: number[] }) {
  const max = Math.max(...bars);
  return (
    <div className="h-40 flex items-end gap-2">
      {bars.map((b, i) => {
        const sub = Math.round(b * (0.55 + (i % 3) * 0.1));
        const subH = (sub / max) * 100;
        const subH2 = ((b - sub) / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-stretch gap-0.5 justify-end group">
            <div className="bg-emerald-500/80 dark:bg-emerald-500/70 rounded-t-sm transition-all group-hover:bg-emerald-500" style={{ height: `${subH2}%` }} />
            <div className="bg-sky-500/80 dark:bg-sky-500/70 rounded-b-sm transition-all group-hover:bg-sky-500" style={{ height: `${subH}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function ActivityIcon({ kind, tone }: { kind: ActivityItem["kind"]; tone: ActivityItem["tone"] }) {
  const tones = {
    neutral: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
    good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  }[tone];

  const icon = {
    submission: <IconInbox />,
    evaluation: <IconCheck />,
    shortlist: <IconStack />,
    pipeline_closed: <IconArchive />,
    member: <IconUser />,
    flag: <IconFlag />,
    credit: <IconCoin />,
  }[kind];

  return (
    <span className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${tones}`}>
      {icon}
    </span>
  );
}

// ----- Locked tiles ---------------------------------------------------

function LockedTile({
  className = "",
  icon,
  label,
  eyebrowExtra,
  headline,
  sub,
  ctaLabel,
  skeleton,
}: {
  className?: string;
  icon: React.ReactNode;
  label: string;
  eyebrowExtra?: string;
  headline: React.ReactNode;
  sub: string;
  ctaLabel: string;
  skeleton: React.ReactNode;
}) {
  return (
    <div className={`relative bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200/80 dark:border-white/[0.06] p-5 overflow-hidden group ${className}`}>
      {/* Lock pill */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        {eyebrowExtra && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 uppercase tracking-wide">{eyebrowExtra}</span>}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
          <IconLock /> Locked
        </span>
      </div>

      {/* Top: label + headline */}
      <div className="relative z-[5] mr-32">
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
          <span className="text-gray-400 dark:text-gray-500">{icon}</span>
          {label}
        </p>
        <p className="mt-1.5 text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">{headline}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{sub}</p>
      </div>

      {/* Skeleton chart, masked */}
      <div className="relative mt-4">
        <div className="opacity-50 dark:opacity-40 blur-[2px] pointer-events-none select-none">
          {skeleton}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-[#0a0a0e] dark:via-[#0a0a0e]/70 pointer-events-none" />
        <button type="button" className="absolute left-1/2 -translate-x-1/2 bottom-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors shadow-md">
          {ctaLabel}
          <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

function MarqueeLockedTile() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02]">
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 p-5 lg:p-7">
        {/* Left: headline + CTA */}
        <div className="lg:col-span-7">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold tracking-wide bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">MARQUEE · LOCKED</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300 font-medium"><IconLock /> Outcomes plan</span>
          </div>
          <h3 className="mt-3 text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-tight">
            <span className="tabular-nums">3</span> hires you would have missed <span className="text-gray-500 dark:text-gray-400 font-normal">this quarter.</span>
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-lg">They came from beyond position 50 in your pipeline — outside what your team would normally skim. You hired them. Want to see who they are, what your ETI saw, and how to find more?</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors">
              See who they are
              <IconArrowRight />
            </button>
            <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-white dark:hover:bg-white/[0.04]">
              How is this calculated?
            </button>
          </div>

          <p className="mt-4 text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Built from your closed-loop hire data · refreshed weekly after 90 days on Team
          </p>
        </div>

        {/* Right: blurred candidate rows preview */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4 relative">
            <p className="text-[10.5px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-3">Preview · candidate names hidden</p>
            <ul className="space-y-2.5">
              {[
                { eti: 78, role: "Senior Backend Engineer", pos: "pos. 67 → hired" },
                { eti: 71, role: "Data Engineer",          pos: "pos. 52 → hired" },
                { eti: 74, role: "Full-Stack Engineer",    pos: "pos. 81 → hired" },
              ].map((row, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-white/10 blur-[3px]" />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{row.role} · {row.pos}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">ETI {row.eti}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-white/90 dark:bg-[#0a0a0e]/90 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300">
                <IconLock /> Hidden
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Skeletons for locked tiles -------------------------------------

function CalibrationSkeleton() {
  return (
    <div className="space-y-2 h-32">
      {[78, 56, 42, 28].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-16 rounded bg-gray-200 dark:bg-white/[0.06]" />
          <div className="flex-1 h-3 rounded bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${w}%` }} />
          </div>
          <div className="h-3 w-8 rounded bg-gray-200 dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

function DollarSkeleton() {
  return (
    <div className="h-32 flex items-end gap-1.5">
      {[40, 65, 50, 80, 70, 95, 75, 88].map((h, i) => (
        <div key={i} className="flex-1 rounded-t bg-emerald-500" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function RatioSkeleton() {
  return (
    <div className="h-32 space-y-3 pt-2">
      <div>
        <div className="flex justify-between mb-1"><div className="h-2.5 w-24 rounded bg-gray-200 dark:bg-white/[0.06]" /><div className="h-2.5 w-10 rounded bg-gray-200 dark:bg-white/[0.06]" /></div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden"><div className="h-full w-[61%] bg-sky-500 rounded-full" /></div>
      </div>
      <div>
        <div className="flex justify-between mb-1"><div className="h-2.5 w-28 rounded bg-gray-200 dark:bg-white/[0.06]" /><div className="h-2.5 w-10 rounded bg-gray-200 dark:bg-white/[0.06]" /></div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden"><div className="h-full w-[42%] bg-teal-500 rounded-full" /></div>
      </div>
      <div>
        <div className="flex justify-between mb-1"><div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-white/[0.06]" /><div className="h-2.5 w-10 rounded bg-gray-200 dark:bg-white/[0.06]" /></div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden"><div className="h-full w-[78%] bg-emerald-500 rounded-full" /></div>
      </div>
    </div>
  );
}

function RiskSkeleton() {
  return (
    <div className="h-32 grid grid-cols-2 gap-2 pt-2">
      {[
        { tone: "rose", label: "Senior Backend" },
        { tone: "amber", label: "Data Engineer" },
        { tone: "emerald", label: "Full-Stack" },
        { tone: "emerald", label: "iOS" },
      ].map((r, i) => (
        <div key={i} className={`rounded-lg border p-2 ${
          r.tone === "rose" ? "border-rose-200 bg-rose-50/50 dark:border-rose-500/20 dark:bg-rose-500/5" :
          r.tone === "amber" ? "border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5" :
          "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5"
        }`}>
          <div className="h-2.5 w-3/4 rounded bg-gray-200 dark:bg-white/[0.06]" />
          <div className="mt-1.5 h-2 w-1/2 rounded bg-gray-200 dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

function ScorecardSkeleton() {
  return (
    <div className="h-28 grid grid-cols-4 gap-3 pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-2 flex-1 rounded bg-gray-200 dark:bg-white/[0.06]" />
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
            <div className="h-full bg-sky-400" style={{ width: `${65 + i * 8}%` }} />
          </div>
          <div className="h-2 w-1/2 rounded bg-gray-200 dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

// ----- Icons ----------------------------------------------------------

const I = "w-3.5 h-3.5";

function IconPlus() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>; }
function IconDownload() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>; }
function IconClock() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconTarget() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>; }
function IconCheckCircle() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconShield() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.6-3.4A12 12 0 0112 2a12 12 0 01-8.6 4.6L3 7v5a9 9 0 009 9 9 9 0 009-9V7z" /></svg>; }
function IconFunnel() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h18l-7 8v6l-4 2v-8L3 4z" /></svg>; }
function IconUsers() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6z" /></svg>; }
function IconTrophy() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8m-4 0v-4m6-13H6v6a6 6 0 0012 0V4zm0 0h3v2a3 3 0 01-3 3M6 4H3v2a3 3 0 003 3" /></svg>; }
function IconInbox() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-2 4h-3l-1 2H10l-1-2H6l-2-4m16 0H4" /></svg>; }
function IconCheck() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" /></svg>; }
function IconStack() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11l-7-7-7 7m14 0v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6m14 0H5" /></svg>; }
function IconArchive() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>; }
function IconUser() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>; }
function IconFlag() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 21V5a2 2 0 012-2h7l1 2h5v9h-6l-1-2H7v9H5z" /></svg>; }
function IconCoin() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-2.21 0-4 .9-4 2s1.79 2 4 2 4 .9 4 2-1.79 2-4 2m0-8V6m0 12v2m9-10a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function IconLock() { return <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11v4m0 4h6a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2h6zm-2-8V7a4 4 0 118 0v4" /></svg>; }
function IconArrowRight() { return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>; }
function IconSparkle() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.5 6L21 11l-5.5 2.5L13 19l-2.5-5.5L5 11l5.5-2.5L13 3z" /></svg>; }
function IconCalibrate() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h4l3-8 4 16 3-8h4" /></svg>; }
function IconCoinStack() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="1.8" fill="none" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>; }
function IconRatio() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H4v5m11 4h5v5M5 4l14 14" /></svg>; }
function IconAlert() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" /></svg>; }
function IconScorecard() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>; }
