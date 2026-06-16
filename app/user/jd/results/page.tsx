"use client";
export const dynamic = 'force-dynamic';
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { usePageTitle } from "@/lib/use-page-title";
import { useResultsData, type Candidate, type WorkHistoryEntry, type GithubMetricsView } from "@/lib/use-results-data";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { EtiInfoButton } from "@/app/components/home-interactive";
import { PreviewSidebar } from "@/app/user/PreviewSidebar";
import {
  ETI_AXIS_BAND_START,
  etiBandFlexWeights,
  etiBucketRangeLabel,
  type EtiDistribution,
} from "@/lib/eti-distribution";

function getRoleFitOneLiner(c: Candidate): string {
  const rf = c.role_fit ?? c.profile?.role_fit;
  if (typeof rf === "string") return rf.trim() || "Not provided";
  if (rf && typeof rf === "object" && "one_liner" in rf) return (rf.one_liner ?? "").trim() || "Not provided";
  return "Not provided";
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "—";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarClassName(score: number): string {
  if (score >= 80) return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300";
  if (score >= 65) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
}

function formatWorkRange(entry: WorkHistoryEntry): string {
  const start = (entry.start ?? "").trim();
  const end = (entry.end ?? "").trim();
  if (!start && !end) return "";
  return `${start || "—"}–${end || "—"}`;
}

function GitHubSignalsColumn({ m }: { m: GithubMetricsView }) {
  const total = m.total_files;
  const code = m.code_files;
  const filesLine =
    total != null && code != null
      ? `${total} files · ${code} are code`
      : total != null
        ? `${total} files`
        : null;
  const hardening =
    typeof m.hardening_density === "number" ? `hardening ${m.hardening_density} hits / 100 LOC` : null;
  const commits =
    m.commits_analyzed != null
      ? m.span_days != null
        ? `${m.commits_analyzed} commits over ${m.span_days} days`
        : `${m.commits_analyzed} commits`
      : null;
  const authorship =
    typeof m.authorship_share === "number" ? `${Math.round(m.authorship_share * 100)}% solo author` : null;
  const infra = (() => {
    const parts: string[] = [];
    if (m.has_ci === false) parts.push("no CI");
    else if (m.has_ci) parts.push("CI present");
    if (m.has_dockerfile === false) parts.push("no Docker");
    else if (m.has_dockerfile) parts.push("Docker present");
    return parts.length ? parts.join(" · ") : null;
  })();
  const items = [
    filesLine,
    m.dir_depth_max != null ? `directory depth ${m.dir_depth_max}` : null,
    hardening,
    commits,
    authorship,
    infra,
  ].filter((s): s is string => !!s);
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        GitHub
      </h4>
      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function WorkHistoryColumn({ entries }: { entries: WorkHistoryEntry[] | undefined }) {
  if (!entries || entries.length === 0) {
    return (
      <div>
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Work history
        </h4>
        <p className="text-sm text-gray-400 dark:text-gray-500">No employment history listed.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Work history
      </h4>
      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        {entries.map((entry, i) => {
          const range = formatWorkRange(entry);
          const parts = [range, entry.employer, entry.title].filter((s): s is string => !!s && s.trim().length > 0);
          return (
            <li key={i}>
              <div className="text-gray-800 dark:text-gray-200">{parts.join(" · ")}</div>
              {entry.scope_one_liner && (
                <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{entry.scope_one_liner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SignalsPanel({ candidate }: { candidate: Candidate }) {
  const metrics = candidate.github_metrics;
  // Junior renders both columns when github_metrics is present; senior never
  // has github_metrics, so it falls through to the single-column work-history
  // layout. ADR-007 §5.
  if (metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 mt-3 border-t border-gray-100 dark:border-white/[0.05]">
        <GitHubSignalsColumn m={metrics} />
        <WorkHistoryColumn entries={candidate.work_history} />
      </div>
    );
  }
  return (
    <div className="pt-3 mt-3 border-t border-gray-100 dark:border-white/[0.05]">
      <WorkHistoryColumn entries={candidate.work_history} />
    </div>
  );
}

function EtiPoolDistributionBar({ distribution }: { distribution: EtiDistribution }) {
  const { buckets, total } = distribution;
  if (total === 0) return null;

  const flexWeights = etiBandFlexWeights(distribution);
  const flexSum = flexWeights.reduce((a, w) => a + w, 0);
  const colWidthPct = flexWeights.map((w) => (w / flexSum) * 100);

  const segmentBoundaryPct = flexWeights.reduce<number[]>((acc, w) => {
    const prev = acc.length ? acc[acc.length - 1] : 0;
    acc.push(prev + (w / flexSum) * 100);
    return acc;
  }, []);

  const ariaBands = buckets
    .map((b, i) => `${b.count} ${etiBucketRangeLabel(i)}`)
    .join(", ");

  const BAND_COLORS = ["#ef4444", "#eab308", "#22c55e", "#0d9488"];

  const midpoints = [
    segmentBoundaryPct[0] * 0.5,
    (segmentBoundaryPct[0] + segmentBoundaryPct[1]) * 0.5,
    (segmentBoundaryPct[1] + segmentBoundaryPct[2]) * 0.5,
    (segmentBoundaryPct[2] + 100) * 0.5,
  ];

  const continuousGradient =
    `linear-gradient(to right, ` +
    `${BAND_COLORS[0]} ${midpoints[0]}%, ` +
    `${BAND_COLORS[1]} ${midpoints[1]}%, ` +
    `${BAND_COLORS[2]} ${midpoints[2]}%, ` +
    `${BAND_COLORS[3]} ${midpoints[3]}%)`;

  return (
    <div className="mb-6 w-full">
      <div
        className="relative h-8 w-full min-h-[2rem] rounded-xl overflow-hidden ring-1 ring-inset ring-gray-200/90 dark:ring-gray-700/90 shadow-inner bg-gray-100/90 dark:bg-gray-800/90"
        role="img"
        aria-label={`ETI pool for this job (${total} applicants). Four bands; column width grows with count but empty bands stay visible. Fill height is share of pool in each band: ${ariaBands}`}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: continuousGradient, opacity: 0.22 }}
          aria-hidden
        />
        <div className="relative flex h-full w-full divide-x divide-white/30 dark:divide-white/20">
          {buckets.map((b, i) => {
            const sharePct = total > 0 ? (b.count / total) * 100 : 0;
            const leftPx = i === 0 ? 0 : segmentBoundaryPct[i - 1];
            const widthPx = colWidthPct[i];
            return (
              <div
                key={i}
                className="relative h-full min-w-0 overflow-hidden"
                style={{ flex: `${flexWeights[i]} 1 0%` }}
              >
                {b.count === 0 && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-45deg,rgba(0,0,0,0.04)_0px,rgba(0,0,0,0.04)_5px,transparent_5px,transparent_10px)]"
                    aria-hidden
                  />
                )}
                <div
                  className="absolute bottom-0 left-0 right-0 overflow-hidden"
                  style={{
                    height: sharePct > 0 ? `${sharePct}%` : "0%",
                    minHeight: b.count > 0 ? 4 : 0,
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${(100 / widthPx) * 100}%`,
                      marginLeft: `${-leftPx * (100 / widthPx)}%`,
                      backgroundImage: continuousGradient,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex w-full mt-1.5 text-[10px] leading-tight tabular-nums">
        {buckets.map((b, i) => {
          const pctRounded = total > 0 ? Math.round((b.count / total) * 100) : 0;
          const wPct = Math.round(colWidthPct[i] * 10) / 10;
          return (
            <div
              key={`label-${i}`}
              className="min-w-0 overflow-hidden px-0.5 text-center"
              style={{ flex: `${flexWeights[i]} 1 0%` }}
              title={`${etiBucketRangeLabel(i)}: ${b.count} applicant${b.count !== 1 ? "s" : ""} (${pctRounded}% of pool); ~${wPct}% of bar width`}
            >
              <div className="truncate font-medium text-gray-700 dark:text-gray-300">{etiBucketRangeLabel(i)}</div>
              <div className={b.count === 0 ? "truncate text-gray-300 dark:text-gray-600" : "truncate text-gray-500 dark:text-gray-400"}>
                {b.count} ({pctRounded}%)
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-1 h-4 w-full text-[10px] text-gray-400 dark:text-gray-500 tabular-nums select-none">
        <span className="absolute left-0 top-0">{ETI_AXIS_BAND_START[0]}</span>
        {[1, 2, 3].map((i) => (
          <span
            key={`tick-${i}`}
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${segmentBoundaryPct[i - 1]}%` }}
          >
            {ETI_AXIS_BAND_START[i]}
          </span>
        ))}
        <span className="absolute right-0 top-0">100</span>
      </div>
    </div>
  );
}

// ===========================================================================
// ADR-009 stage transitions still power the data model (PATCH /api/candidate/[id]/stage),
// but the full interview funnel (offer / hired / declined) now lives on a SEPARATE
// interview page — kept out of here as further scope. This page only triages the
// matched pool: shortlist a candidate for interview, or remove them from the pool.
// Both actions are reversible. Cards are selectable for bulk triage, mirroring the
// Role pipelines page.
// ===========================================================================

type Stage = "screening" | "interviewing" | "offer" | "hired" | "rejected" | "withdrawn";
type Outcome = "cleared" | "failed" | "pending";

// Collapse the six funnel stages into the three states this page surfaces.
function cardState(stage: Stage): "review" | "shortlisted" | "removed" {
  if (stage === "rejected" || stage === "withdrawn") return "removed";
  if (stage === "screening") return "review";
  return "shortlisted";
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

// The per-card triage row that replaces the old stage funnel. Shortlist → hands
// the candidate to the (separate) interview surface; Remove → rejects from the
// pool. Both reversible so nothing is lost.
function ResultActionRow({
  stage,
  saving,
  onShortlist,
  onRemove,
  onRestore,
}: {
  stage: Stage;
  saving: boolean;
  onShortlist: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const state = cardState(stage);
  return (
    <div className={`mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.05] flex flex-wrap items-center gap-2 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
      {state === "shortlisted" && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
          Shortlisted for interview
        </span>
      )}
      {state === "removed" && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
          Removed
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
        {state === "review" && (
          <>
            <ActBtn tone="primary" label="Shortlist for interview" onClick={onShortlist} />
            <ActBtn tone="danger" label="Remove" onClick={onRemove} />
          </>
        )}
        {state === "shortlisted" && <ActBtn tone="muted" label="Undo" onClick={onRestore} />}
        {state === "removed" && <ActBtn tone="muted" label="Restore" onClick={onRestore} />}
      </div>
    </div>
  );
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

function JDResultsContent() {
  usePageTitle("Top Candidates");
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  const { top20, etiDistribution, isLoading, error, revalidate } = useResultsData(jobId);

  const [navCollapsed, setNavCollapsed] = useState(false);

  // Current stage per candidate (cheap read, no Gemini). Optimistically updated.
  const [stageMap, setStageMap] = useState<Record<string, { stage: Stage; interviewOutcome: Outcome | null }>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Selection for bulk triage (mirrors the Role pipelines page).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!jobId) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const token = await getIdTokenOrNull();
        const res = await fetch(`/api/jd/${encodeURIComponent(jobId)}/interviews`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { candidates?: { id: string; stage: Stage; interviewOutcome: Outcome | null }[] };
        const map: Record<string, { stage: Stage; interviewOutcome: Outcome | null }> = {};
        (data.candidates ?? []).forEach((c) => { map[c.id] = { stage: c.stage, interviewOutcome: c.interviewOutcome }; });
        setStageMap(map);
      } catch {
        /* stage data is best-effort; cards still render without it */
      }
    });
    return () => unsub();
  }, [jobId]);

  const move = useCallback(async (id: string, stage: Stage, interviewOutcome?: Outcome) => {
    setStageMap((prev) => {
      const prevEntry = prev[id];
      return { ...prev, [id]: { stage, interviewOutcome: interviewOutcome ?? prevEntry?.interviewOutcome ?? null } };
    });
    setSaving((s) => new Set(s).add(id));
    const revert = stageMap[id];
    try {
      const token = await getIdTokenOrNull();
      const res = await fetch(`/api/candidate/${encodeURIComponent(id)}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ stage, ...(interviewOutcome ? { interviewOutcome } : {}) }),
      });
      if (!res.ok) throw new Error("save_failed");
    } catch {
      setStageMap((prev) => ({ ...prev, [id]: revert ?? { stage: "screening", interviewOutcome: null } }));
      if (typeof window !== "undefined") window.alert("Could not update the candidate. Please try again.");
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [stageMap]);

  const counts = useMemo(() => {
    let shortlisted = 0, removed = 0;
    Object.values(stageMap).forEach((s) => {
      if (s.stage === "interviewing" || s.stage === "offer" || s.stage === "hired") shortlisted++;
      else if (s.stage === "rejected" || s.stage === "withdrawn") removed++;
    });
    return { shortlisted, removed };
  }, [stageMap]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const allSelected = top20.length > 0 && top20.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected((s) => (s.size === top20.length ? new Set() : new Set(top20.map((c) => c.id))));

  const bulkMove = async (stage: Stage) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => move(id, stage)));
    setSelected(new Set());
  };

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exportCsv = () => {
    const headers = ["Rank", "Name", "Email", "ETI Score", "Location", "Work Types", "Work Auth", "Title", "Edge", "Flag", "Role Fit"];
    const rows = top20.map((c, i) => {
      const wt = c.matchData?.workTypes;
      const workTypes = Array.isArray(wt) ? wt.join("; ") : wt != null ? String(wt) : "";
      return [
        String(i + 1),
        c.candidateName ?? "",
        c.email ?? "",
        String(c.score ?? ""),
        (c.matchData?.locations ?? []).join("; "),
        workTypes,
        (c.matchData?.work_auth ?? "").trim(),
        c.card?.title ?? "",
        c.card?.edge ?? "",
        c.card?.flag ?? "",
        getRoleFitOneLiner(c),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    // Prepend a BOM so Excel reads UTF-8 correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eigenwork-top-candidates-${jobId ?? "pipeline"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---- Body, by state -----------------------------------------------------
  let body: ReactNode;
  if (!jobId) {
    body = (
      <div className="py-20 text-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm">Missing jobId in URL. Use /user/jd/results?jobId=…</p>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div className="py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading results…</p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="py-20 flex flex-col items-center">
        <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => revalidate()}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  } else if (top20.length === 0 && etiDistribution.total === 0) {
    body = (
      <div className="py-20 text-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm">No applicants in the pool for this job yet.</p>
      </div>
    );
  } else {
    body = (
      <>
        <EtiPoolDistributionBar distribution={etiDistribution} />
        {top20.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">
            No matching candidates passed the filters (role fit, ETI ≥ 50, and work authorization).
          </p>
        ) : (
          <>
            {selected.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-500/[0.08] border border-sky-200/60 dark:border-sky-500/20">
                <p className="text-sm text-sky-900 dark:text-sky-200">
                  <span className="font-semibold tabular-nums">{selected.size}</span> selected
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => bulkMove("interviewing")} className="px-2.5 py-1 rounded-md text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/15">Shortlist for interview</button>
                  <button type="button" onClick={() => bulkMove("rejected")} className="px-2.5 py-1 rounded-md text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15">Remove</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="px-2 py-1 text-xs text-sky-700 dark:text-sky-300 hover:underline">Clear</button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 dark:border-white/15 text-sky-600 focus:ring-sky-500/40"
                />
                Select all
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{top20.length} candidate{top20.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="space-y-3">
              {top20.map((c) => {
                const location = (c.matchData?.locations ?? []).join(", ");
                const workTypesRaw = c.matchData?.workTypes;
                const workTypes = Array.isArray(workTypesRaw) ? workTypesRaw.join(", ") : (workTypesRaw ? String(workTypesRaw) : "");
                const workAuth = (c.matchData?.work_auth ?? "").trim();
                const evidenceUnavailable = c.esq_status === "unavailable";
                const name = (c.candidateName ?? "").trim();
                const email = (c.email ?? "").trim();
                const metaParts = [location, workTypes, workAuth].filter(Boolean);
                const metaLine = metaParts.join(" · ");
                const initials = getInitials(name || c.id);
                // Title falls back to role_fit (or "Candidate") when the doc is
                // legacy and the card field has not yet been populated by the
                // migration script (ADR-007 Phase 6).
                const rfObj = !c.card?.title
                  ? (typeof c.role_fit === "object" ? c.role_fit : typeof c.profile?.role_fit === "object" ? c.profile.role_fit : undefined)
                  : undefined;
                const title = (c.card?.title ?? rfObj?.title ?? "Candidate").trim() || "Candidate";
                const edge = (c.card?.edge ?? "").trim();
                const flag = c.card?.flag?.trim() || null;
                const isExpanded = expandedIds.has(c.id);
                const hasSignals = !!c.github_metrics || (c.work_history && c.work_history.length > 0) || c.work_history?.length === 0;
                const isSelected = selected.has(c.id);
                const stage = stageMap[c.id]?.stage ?? "screening";
                return (
                  <li
                    key={c.id}
                    className={`bg-white dark:bg-white/[0.02] rounded-xl border shadow-sm dark:shadow-none transition-colors ${isSelected ? "border-sky-300 dark:border-sky-500/40" : "border-gray-200 dark:border-white/[0.05]"}`}
                  >
                    <div className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(c.id)}
                            className="mt-1 rounded border-gray-300 dark:border-white/15 text-sky-600 focus:ring-sky-500/40"
                            aria-label={`Select ${name || "candidate"}`}
                          />
                          <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium ${avatarClassName(c.score)}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {name || "—"}
                            </p>
                            {email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">ETI {c.score}</span>
                            <EtiInfoButton />
                          </span>
                          {c.yoe != null && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {c.yoe} yr{c.yoe !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5">
                        {title}
                      </p>
                      {edge && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-2">
                          {edge}
                        </p>
                      )}
                      {flag && (
                        <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-md bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 text-sm">
                          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                          </svg>
                          <span>{flag}</span>
                        </div>
                      )}
                      {evidenceUnavailable && !flag && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Evidence unavailable — scored on resume signal only.
                        </p>
                      )}
                      {metaLine && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                          {metaLine}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {hasSignals && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(c.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                            aria-expanded={isExpanded}
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            Signals
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            // Always mint a fresh signed URL at click time, so the
                            // button works even if the page has been open for >1h
                            // since the embedded URL was minted. See bugs-fixed/
                            // storage.txt (2026-06-03).
                            try {
                              const token = await auth.currentUser?.getIdToken();
                              const res = await fetch(`/api/candidate/${encodeURIComponent(c.id)}/resume`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                              });
                              if (!res.ok) {
                                if (c.resume_url) {
                                  window.open(c.resume_url, "_blank", "noopener,noreferrer");
                                  return;
                                }
                                throw new Error("resume_unavailable");
                              }
                              const { url } = (await res.json()) as { url?: string };
                              if (!url) throw new Error("resume_unavailable");
                              window.open(url, "_blank", "noopener,noreferrer");
                            } catch {
                              // Silent fallback: nothing better to do at this layer
                              // than fail the click — the page-load URL is the
                              // last-resort fallback above.
                            }
                          }}
                          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-white/[0.1] rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Download resume ⬇
                        </button>
                      </div>
                      {isExpanded && hasSignals && <SignalsPanel candidate={c} />}
                      <ResultActionRow
                        stage={stage}
                        saving={saving.has(c.id)}
                        onShortlist={() => move(c.id, "interviewing")}
                        onRemove={() => move(c.id, "rejected")}
                        onRestore={() => move(c.id, "screening")}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    );
  }

  const subtitle =
    !jobId || isLoading || error
      ? "Top candidates for this role"
      : `${top20.length} candidate${top20.length === 1 ? "" : "s"} · ${counts.shortlisted} shortlisted · ${counts.removed} removed`;

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <a href="/user/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">Dashboard</a>
                <ChevronTiny />
                <a href="/user/pipelines" className="hover:text-gray-900 dark:hover:text-gray-200">Role pipelines</a>
                <ChevronTiny />
                <span className="text-gray-700 dark:text-gray-200 font-medium">Results</span>
              </nav>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Pipeline results</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
              {jobId && (
                <div className="mt-3 inline-flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-lg">
                  <span className="px-3 py-1 rounded-md text-xs font-medium bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm">Shortlist</span>
                  <a href={`/user/jd/results/${encodeURIComponent(jobId)}/interviews`} className="px-3 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Interview pipeline</a>
                </div>
              )}
            </div>
            {top20.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-6">{body}</div>
    </div>
  );
}


export default function JDResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center"><p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p></div>}>
      <JDResultsContent />
    </Suspense>
  );
}
