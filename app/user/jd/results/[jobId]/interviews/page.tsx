"use client";

// /user/jd/results/[jobId]/interviews — the ADR-009 "Interviewing surface".
//
// The second of the two-surface stage model (ADR-009): the shortlist surface
// (/user/jd/results) selects candidates; THIS surface manages the small active
// set over days/weeks. Rank is no longer load-bearing here (it already did its
// job selecting these people), so candidates are grouped by next-step status
// rather than ranked. It is the outcome-capture surface — it writes
// interviewOutcome (cleared|failed) and the offer/hire timestamps via
// PATCH /api/candidate/[id]/stage — and it computes this role's live KPIs:
//   • #5 pipeline by stage   • #6 interview-clear rate (cleared / selected)
//   • #3 offer acceptance     • #1 time-to-fill (role created → first hire)
// Org-wide aggregates of the same funnel live on /user/analytics (Team).

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { usePageTitle } from "@/lib/use-page-title";
import { PreviewSidebar } from "@/app/user/PreviewSidebar";

type Stage = "screening" | "interviewing" | "offer" | "hired" | "rejected" | "withdrawn";
type Outcome = "cleared" | "failed" | "pending";

type InterviewCandidate = {
  id: string;
  name: string;
  eti: number | null;
  flag: string | null;
  rank: number;
  stage: Stage;
  interviewOutcome: Outcome | null;
  selectedForInterview?: boolean;
  offerExtendedAt?: number | null;
  hiredAt?: number | null;
};

type InterviewsResponse = {
  jobId: string;
  title: string;
  seniority: string;
  hasShortlist: boolean;
  createdAt: number | null;
  candidates: InterviewCandidate[];
};

const fetcher = async (url: string): Promise<InterviewsResponse> => {
  const token = await getIdTokenOrNull();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error("Failed to load the interview pipeline.");
  return res.json();
};

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function etiTone(score: number | null): string {
  if (score == null) return "text-gray-400 dark:text-gray-500";
  if (score >= 80) return "text-teal-600 dark:text-teal-400";
  if (score >= 65) return "text-emerald-600 dark:text-emerald-400";
  return "text-amber-600 dark:text-amber-400";
}

export default function InterviewPipelinePage() {
  usePageTitle("Interview pipeline");
  const router = useRouter();
  const params = useParams();
  const jobId = (params.jobId as string) || "";

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.replace("/"); return; }
      setUserId(u.uid);
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const { data, error, isLoading, mutate } = useSWR<InterviewsResponse>(
    userId && jobId ? `/api/jd/${encodeURIComponent(jobId)}/interviews` : null,
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 2000 }
  );

  const cands = useMemo(() => data?.candidates ?? [], [data]);

  // Everyone who entered the interview funnel: selected for interview, or already
  // past it (offer/hired). Screening candidates and screening-rejects stay on the
  // shortlist surface — they were never interviewed.
  const inFunnel = useMemo(
    () =>
      cands.filter(
        (c) =>
          c.selectedForInterview === true ||
          c.stage === "interviewing" ||
          c.stage === "offer" ||
          c.stage === "hired"
      ),
    [cands]
  );

  const kpi = useMemo(() => {
    const interviewing = inFunnel.filter((c) => c.stage === "interviewing").length;
    const offer = inFunnel.filter((c) => c.stage === "offer").length;
    const hired = inFunnel.filter((c) => c.stage === "hired").length;
    const declined = inFunnel.filter((c) => c.stage === "withdrawn").length;
    const selected = inFunnel.length;
    const cleared = inFunnel.filter((c) => c.interviewOutcome === "cleared" || c.stage === "hired").length;

    // #3 offer acceptance: accepted (hired) over decided offers (hired + declined).
    const decidedOffers = hired + declined;

    // #1 time-to-fill: days from role created to the first recorded hire.
    const firstHiredAt = inFunnel
      .map((c) => c.hiredAt)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b)[0];
    const ttf =
      firstHiredAt != null && data?.createdAt != null
        ? Math.max(0, Math.round((firstHiredAt - data.createdAt) / 86_400_000))
        : null;

    return {
      interviewing,
      offer,
      hired,
      declined,
      selected,
      cleared,
      clearRate: pct(cleared, selected),
      acceptance: pct(hired, decidedOffers),
      decidedOffers,
      ttf,
    };
  }, [inFunnel, data]);

  const move = async (id: string, stage: Stage, interviewOutcome?: Outcome) => {
    setSaving((s) => new Set(s).add(id));
    // Optimistic: patch the SWR cache so the row jumps groups immediately.
    mutate(
      (cur) =>
        cur
          ? {
              ...cur,
              candidates: cur.candidates.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      stage,
                      interviewOutcome: interviewOutcome ?? c.interviewOutcome,
                      selectedForInterview: stage === "interviewing" ? true : c.selectedForInterview,
                    }
                  : c
              ),
            }
          : cur,
      { revalidate: false }
    );
    try {
      const token = await getIdTokenOrNull();
      const res = await fetch(`/api/candidate/${encodeURIComponent(id)}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ stage, ...(interviewOutcome ? { interviewOutcome } : {}) }),
      });
      if (!res.ok) throw new Error("save_failed");
      await mutate();
    } catch {
      await mutate();
      if (typeof window !== "undefined") window.alert("Could not update the candidate. Please try again.");
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  // Draft a personalized outreach email from the candidate's persisted card and
  // open it in the recruiter's own mail client (mailto). The server never sends —
  // the recruiter reviews and hits Send themselves (ADR-010 outreach gate).
  const draftOutreach = async (id: string) => {
    setDrafting((s) => new Set(s).add(id));
    try {
      const token = await getIdTokenOrNull();
      const res = await fetch(`/api/candidate/${encodeURIComponent(id)}/outreach`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("draft_failed");
      const data = (await res.json()) as { email: string | null; mailto: string | null };
      if (!data.email || !data.mailto) {
        if (typeof window !== "undefined") window.alert("No email on file for this candidate — can't draft outreach.");
        return;
      }
      if (typeof window !== "undefined") window.location.href = data.mailto;
    } catch {
      if (typeof window !== "undefined") window.alert("Could not draft outreach. Please try again.");
    } finally {
      setDrafting((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  if (authChecking) return <div className="min-h-screen bg-white dark:bg-[#0a0a0a]" />;

  const title = data?.title?.trim() || "this role";
  const seniority = data?.seniority?.trim() || "";

  const groups: { key: string; label: string; hint: string; tone: string; rows: InterviewCandidate[] }[] = [
    { key: "interviewing", label: "In interview", hint: "Awaiting outcome", tone: "bg-sky-500", rows: inFunnel.filter((c) => c.stage === "interviewing") },
    { key: "offer", label: "Offer extended", hint: "Awaiting response", tone: "bg-amber-500", rows: inFunnel.filter((c) => c.stage === "offer") },
    { key: "hired", label: "Hired", hint: "Closed — won", tone: "bg-emerald-500", rows: inFunnel.filter((c) => c.stage === "hired") },
    { key: "not-advancing", label: "Not advancing", hint: "Interview failed or offer declined", tone: "bg-gray-400", rows: inFunnel.filter((c) => c.stage === "rejected" || c.stage === "withdrawn") },
  ];

  let body: ReactNode;
  if (isLoading && !data) {
    body = <div className="py-20 text-center"><p className="text-gray-500 dark:text-gray-400 text-sm">Loading interview pipeline…</p></div>;
  } else if (error) {
    body = (
      <div className="py-20 flex flex-col items-center">
        <p className="text-red-600 dark:text-red-400 text-sm mb-4">Could not load the interview pipeline.</p>
        <button type="button" onClick={() => mutate()} className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200">Retry</button>
      </div>
    );
  } else if (inFunnel.length === 0) {
    body = (
      <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-dashed border-gray-300 dark:border-white/[0.08] p-12 text-center">
        <div className="w-12 h-12 bg-sky-50 dark:bg-sky-500/15 rounded-full flex items-center justify-center mx-auto mb-4 text-sky-600 dark:text-sky-300">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.4-1.2" /></svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No one in the interview stage yet</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-5 max-w-sm mx-auto">
          {data && !data.hasShortlist
            ? "Generate this role's shortlist first, then shortlist candidates for interview."
            : "Open the shortlist and use “Shortlist for interview” to move candidates into the pipeline."}
        </p>
        <a href={`/user/jd/results?jobId=${encodeURIComponent(jobId)}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200">
          Go to shortlist
        </a>
      </div>
    );
  } else {
    body = (
      <>
        {/* KPI strip — this role's live ADR-009 metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiTile label="In the funnel" accent="sky">
            <div className="mt-1.5 flex items-end gap-4">
              <Stat n={kpi.interviewing} l="interviewing" />
              <Stat n={kpi.offer} l="offer" />
              <Stat n={kpi.hired} l="hired" tone="text-emerald-600 dark:text-emerald-400" />
            </div>
          </KpiTile>
          <KpiTile label="Interview-clear rate" accent="emerald">
            <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{kpi.clearRate != null ? `${kpi.clearRate}%` : "—"}</p>
            <Hint>{kpi.cleared} of {kpi.selected} selected cleared</Hint>
          </KpiTile>
          <KpiTile label="Offer acceptance" accent="amber">
            <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{kpi.acceptance != null ? `${kpi.acceptance}%` : "—"}</p>
            <Hint>{kpi.decidedOffers > 0 ? `${kpi.hired} of ${kpi.decidedOffers} offers accepted` : "no decided offers yet"}</Hint>
          </KpiTile>
          <KpiTile label="Time-to-fill" accent="teal">
            <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-gray-50 tabular-nums">{kpi.ttf != null ? `${kpi.ttf}` : "—"}<span className="text-base font-normal text-gray-400 ml-1">days</span></p>
            <Hint>{kpi.ttf != null ? "role created → first hire" : "activates on first hire"}</Hint>
          </KpiTile>
        </div>

        {/* Funnel — grouped by next-step status (rank no longer load-bearing) */}
        <div className="space-y-4">
          {groups.map((g) =>
            g.rows.length === 0 ? null : (
              <div key={g.key} className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.05] flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${g.tone}`} />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{g.label}</h2>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{g.rows.length}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{g.hint}</span>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {g.rows.map((c) => (
                    <li key={c.id} className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 ${saving.has(c.id) ? "opacity-60 pointer-events-none" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded-md text-[11px] font-semibold tabular-nums bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">#{c.rank}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                            <span className={`text-xs font-semibold tabular-nums ${etiTone(c.eti)}`}>ETI {c.eti ?? "—"}</span>
                            {c.interviewOutcome === "failed" && c.stage === "rejected" && (
                              <span className="text-[10.5px] font-medium text-rose-600 dark:text-rose-400">interview failed</span>
                            )}
                          </div>
                          {c.flag && (
                            <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400 inline-flex items-start gap-1">
                              <svg className="w-3 h-3 mt-px shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
                              <span className="truncate">{c.flag}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.stage === "interviewing" && (
                          <>
                            <ActBtn tone="primary" label="Passed → extend offer" onClick={() => move(c.id, "offer", "cleared")} />
                            <ActBtn tone="danger" label="Interview failed" onClick={() => move(c.id, "rejected", "failed")} />
                          </>
                        )}
                        {c.stage === "offer" && (
                          <>
                            <ActBtn tone="primary" label="Mark hired" onClick={() => move(c.id, "hired")} />
                            <ActBtn tone="muted" label="Offer declined" onClick={() => move(c.id, "withdrawn")} />
                          </>
                        )}
                        {c.stage === "hired" && <ActBtn tone="muted" label="Reopen" onClick={() => move(c.id, "interviewing")} />}
                        {(c.stage === "rejected" || c.stage === "withdrawn") && (
                          <ActBtn tone="muted" label="Restore to interview" onClick={() => move(c.id, "interviewing")} />
                        )}
                        <button
                          type="button"
                          onClick={() => draftOutreach(c.id)}
                          disabled={drafting.has(c.id)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/15 disabled:opacity-50"
                          title="Draft a personalized outreach email"
                        >
                          {drafting.has(c.id) ? "Drafting…" : "Draft outreach"}
                        </button>
                        <button
                          type="button"
                          onClick={() => notifySoon("Interview notes")}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                          title="Interview notes — coming soon"
                        >
                          Notes
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>

        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          These are this role&apos;s live figures. Org-wide hiring analytics across every role live on the{" "}
          <a href="/user/analytics" className="font-medium text-gray-600 dark:text-gray-300 hover:underline">Analytics</a> page (Team).
        </p>
      </>
    );
  }

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="pipelines" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-5">
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <a href="/user/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">Dashboard</a>
            <ChevronTiny />
            <a href="/user/pipelines" className="hover:text-gray-900 dark:hover:text-gray-200">Role pipelines</a>
            <ChevronTiny />
            <span className="text-gray-700 dark:text-gray-200 font-medium">Interviews</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Interview pipeline</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}{seniority ? ` · ${seniority}` : ""}</p>
          <div className="mt-3 inline-flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-lg">
            <a href={`/user/jd/results?jobId=${encodeURIComponent(jobId)}`} className="px-3 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Shortlist</a>
            <span className="px-3 py-1 rounded-md text-xs font-medium bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm">Interview pipeline</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-6">{body}</div>
    </div>
  );
}

function ActBtn({ label, tone, onClick }: { label: string; tone: "primary" | "muted" | "danger"; onClick: () => void }) {
  const cls = {
    primary: "text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200",
    muted: "text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.1] hover:bg-gray-50 dark:hover:bg-gray-800",
    danger: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25",
  }[tone];
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${cls}`}>
      {label}
    </button>
  );
}

function KpiTile({ label, accent, children }: { label: string; accent: "sky" | "emerald" | "amber" | "teal"; children: ReactNode }) {
  const rail = {
    sky: "before:bg-sky-500/40",
    emerald: "before:bg-emerald-500/40",
    amber: "before:bg-amber-500/40",
    teal: "before:bg-teal-500/40",
  }[accent];
  return (
    <div className={`relative bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-4 overflow-hidden before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r ${rail}`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      {children}
    </div>
  );
}

function Stat({ n, l, tone = "text-gray-900 dark:text-gray-50" }: { n: number; l: string; tone?: string }) {
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums leading-none ${tone}`}>{n}</p>
      <p className="mt-1 text-[10.5px] text-gray-500 dark:text-gray-400">{l}</p>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{children}</p>;
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}
