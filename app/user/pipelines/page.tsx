"use client";

// /user/pipelines — the v2 "Role pipelines" preview, promoted onto the real route
// VERBATIM. The design (markup, columns, colors, the Paused status, the source
// column, the bulk bar) is unchanged from app/user/pipelines-v2. Only the wiring
// is connected:
//   • data            → useDashboardData (real /api/jd/list + entitlement)
//   • New pipeline     → /user/jd
//   • row title / View → /user/jd/results?jobId=
//   • Shortlist        → POST /match then POST /close (confirm modal)
//   • kebab            → Copy intake link (paused-gated) · Edit settings · Delete
//   • bulk bar         → Copy links · Close · Export CSV · Delete (selected)
// Controls that have no backing yet (source attribution) are KEPT as designed and
// flagged "coming soon" on use — not stripped. ("Copy default intake link" was
// removed — there is no org-wide default intake link, only per-pipeline links.)

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { mutate as swrMutate } from "swr";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { PreviewSidebar } from "../PreviewSidebar";

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

type Status = "open" | "awaiting" | "ready" | "closed" | "paused";

type Pipeline = {
  id: string;
  title: string;
  level: "Junior" | "Mid" | "Senior";
  applied: number;
  cap: number;
  status: Status;
  daysOpen: number;
  lastActivity: string;
  topEti: number | null;
  shortlistCount: number;
  flagsCount: number;
  isClosed: boolean;
  hasMatchResult: boolean;
  // `source` stays optional/hidden until the intake "How did you hear?" field
  // ships (ADR-009 §source attribution). Mapped from live data as undefined.
  source?: "Link" | "ATS · Ashby" | "Email forward";
};

// Live row shape from GET /api/jd/list (ADR-009 enriched it with
// seniority/topEti/shortlistCount/flagsCount, all derived from the persisted
// matchResult — no extra reads).
type JdListRow = {
  id: string;
  title: string;
  createdAt: number | null;
  submissionCap: number;
  isClosed: boolean;
  appliedCount: number;
  hasMatchResult?: boolean;
  seniority?: string;
  topEti?: number | null;
  shortlistCount?: number;
  flagsCount?: number;
};

function seniorityToLevel(s: string | undefined): Pipeline["level"] {
  const t = (s || "").toLowerCase();
  if (/junior|jr|intern|entry|grad/.test(t)) return "Junior";
  if (/senior|sr|staff|lead|principal|architect/.test(t)) return "Senior";
  return "Mid";
}

// Map jd/list fields → the v2 status vocabulary using only data we have today.
// (No "paused" — that's not a concept jd/list exposes yet.)
function deriveStatus(row: JdListRow): Status {
  const ratio = row.submissionCap > 0 ? row.appliedCount / row.submissionCap : 0;
  if (row.isClosed || row.hasMatchResult) return "closed";
  if (ratio >= 0.6) return "ready";
  if (row.appliedCount > 0) return "awaiting";
  return "open";
}

function relativeDays(createdAt: number | null): { daysOpen: number; label: string } {
  if (!createdAt) return { daysOpen: 0, label: "—" };
  const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  return { daysOpen: days, label: days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago` };
}

function mapRow(row: JdListRow): Pipeline {
  const { daysOpen, label } = relativeDays(row.createdAt);
  return {
    id: row.id,
    title: row.title || "Untitled role",
    level: seniorityToLevel(row.seniority),
    applied: row.appliedCount ?? 0,
    cap: row.submissionCap ?? 0,
    status: deriveStatus(row),
    daysOpen,
    lastActivity: label,
    topEti: row.topEti ?? null,
    shortlistCount: row.shortlistCount ?? 0,
    flagsCount: row.flagsCount ?? 0,
    isClosed: Boolean(row.isClosed),
    hasMatchResult: row.hasMatchResult === true,
    // source intentionally omitted — hidden until intake attribution ships.
  };
}

const STATUS_STYLE: Record<Status, { label: string; pill: string; dot: string }> = {
  open:     { label: "Open",     pill: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",     dot: "bg-sky-500" },
  awaiting: { label: "Filling",  pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",         dot: "bg-amber-500" },
  ready:    { label: "Ready to shortlist", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  closed:   { label: "Closed",   pill: "bg-gray-100 text-gray-600 dark:bg-white/[0.05] dark:text-gray-400",           dot: "bg-gray-400" },
  paused:   { label: "Paused",   pill: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",             dot: "bg-rose-500" },
};

type Filter = "all" | "open" | "awaiting" | "ready" | "closed" | "paused";
type SortKey = "recent" | "applied" | "cap";

// Per-row action surface threaded into both views (connects the v2 buttons).
type RowActions = {
  screensRemaining: number;
  onCopy: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (p: Pipeline) => void;
  onShortlist: (p: Pipeline) => void;
  onView: (id: string) => void;
};

export default function PipelinesV2Page() {
  usePageTitle("Role pipelines");
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [navCollapsed, setNavCollapsed] = useState(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [generateModal, setGenerateModal] = useState<Pipeline | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [deleteModal, setDeleteModal] = useState<Pipeline | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace("/"); return; }
      setAuthChecking(false);
      setUserId(user.uid);
    });
    return () => unsub();
  }, [router]);

  const { pipelines, entitlement, isLoading, error: hookError, revalidate, mutatePipelines } = useDashboardData(userId);
  const screensRemaining = entitlement?.screensRemaining ?? 0;

  const rows = useMemo(() => (pipelines as JdListRow[]).map(mapRow), [pipelines]);
  const loading = authChecking || isLoading;
  const error = hookError;

  const filtered = useMemo(() => {
    let list = rows.slice();
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.level.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (sort === "applied") return b.applied - a.applied;
      if (sort === "cap") return b.cap - a.cap;
      return a.daysOpen - b.daysOpen;
    });
    return list;
  }, [rows, filter, sort, query]);

  const counts: Record<Filter, number> = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, open: 0, awaiting: 0, ready: 0, closed: 0, paused: 0 };
    rows.forEach((p) => { c[p.status] += 1; });
    return c;
  }, [rows]);

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))));
  };

  // ---- Connected actions (ported from the legacy dashboard) ---------------

  const handleCopyIntakeLink = (jobId: string) => {
    if (screensRemaining <= 0) return;
    const url = typeof window !== "undefined" ? `${window.location.origin}/candidate?jobId=${jobId}` : "";
    navigator.clipboard.writeText(url).then(
      () => alert("Intake link copied to clipboard."),
      () => alert("Could not copy. Please copy the link manually.")
    );
  };

  const handleGenerateContinue = async () => {
    if (!generateModal) return;
    setGenerateLoading(true);
    setGenerateElapsed(0);
    const tickStart = Date.now();
    const ticker = setInterval(() => setGenerateElapsed(Math.floor((Date.now() - tickStart) / 1000)), 1000);
    try {
      const token = await auth.currentUser?.getIdToken();
      const cloudRunBase = process.env.NEXT_PUBLIC_CLOUD_RUN_URL?.replace(/\/+$/, "") ?? "";
      const res = cloudRunBase
        ? await fetch(`${cloudRunBase}/match`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jobId: generateModal.id }) })
        : await fetch(`/api/jd/match?jobId=${encodeURIComponent(generateModal.id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Request failed");
      const closeRes = await fetch("/api/jd/close", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jobId: generateModal.id }) });
      if (!closeRes.ok) throw new Error("Failed to close pipeline");
      const completedId = generateModal.id;
      setGenerateModal(null);
      await revalidate();
      await swrMutate(`/api/jd/match?jobId=${encodeURIComponent(completedId)}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      clearInterval(ticker);
      setGenerateLoading(false);
      setGenerateElapsed(0);
    }
  };

  const deleteJob = async (jobId: string) => {
    const token = await auth.currentUser?.getIdToken();
    const cloudRunBase = process.env.NEXT_PUBLIC_CLOUD_RUN_URL?.replace(/\/+$/, "") ?? "";
    const res = cloudRunBase
      ? await fetch(`${cloudRunBase}/jd/cascade-delete`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jobId }) })
      : await fetch(`/api/jd/${encodeURIComponent(jobId)}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!res.ok) throw new Error("Failed to delete");
  };

  const removeFromCache = (ids: Set<string>) =>
    mutatePipelines(
      (current: { pipelines: JdListRow[] } | JdListRow[] | undefined) => {
        const cur = Array.isArray(current) ? current : (current && "pipelines" in current ? current.pipelines : []);
        return { pipelines: cur.filter((p: JdListRow) => !ids.has(p.id)) };
      },
      { revalidate: true }
    );

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    try {
      const deletedId = deleteModal.id;
      await deleteJob(deletedId);
      setDeleteModal(null);
      setSelected((s) => { const n = new Set(s); n.delete(deletedId); return n; });
      await removeFromCache(new Set([deletedId]));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
      await revalidate();
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkCopy = () => {
    const ids = [...selected];
    if (ids.length === 0 || typeof window === "undefined") return;
    const links = ids.map((id) => `${window.location.origin}/candidate?jobId=${id}`).join("\n");
    navigator.clipboard.writeText(links).then(
      () => alert(`Copied ${ids.length} intake link${ids.length === 1 ? "" : "s"} to clipboard.`),
      () => alert("Could not copy. Please copy the links manually.")
    );
  };

  const handleBulkClose = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Freeze new submissions for ${ids.length} pipeline${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      await Promise.all(
        ids.map((jobId) => fetch("/api/jd/close", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jobId }) }))
      );
      setSelected(new Set());
      await revalidate();
    } catch {
      alert("Something went wrong closing the selected pipelines.");
      await revalidate();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkExport = () => {
    const ids = new Set([...selected]);
    const picked = rows.filter((p) => ids.has(p.id));
    if (picked.length === 0) return;
    const headers = ["Role", "Level", "Status", "Submissions", "Cap", "Top ETI", "Shortlisted", "Flags"];
    const csvRows = picked.map((p) => [
      p.title, p.level, STATUS_STYLE[p.status].label, String(p.applied), String(p.cap),
      p.topEti != null ? String(p.topEti) : "", String(p.shortlistCount), String(p.flagsCount),
    ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "eigenwork-pipelines.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => deleteJob(id)));
      setBulkDeleteOpen(false);
      setSelected(new Set());
      await removeFromCache(new Set(ids));
    } catch {
      alert("Something went wrong deleting the selected pipelines.");
      await revalidate();
    } finally {
      setBulkBusy(false);
    }
  };

  const actions: RowActions = {
    screensRemaining,
    onCopy: handleCopyIntakeLink,
    onEdit: (id) => router.push(`/user/jd/confirm?jobId=${encodeURIComponent(id)}`),
    onDelete: (p) => setDeleteModal(p),
    onShortlist: (p) => setGenerateModal(p),
    onView: (id) => router.push(`/user/jd/results?jobId=${encodeURIComponent(id)}`),
  };

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="pipelines" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <a href="/user/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">Dashboard</a>
                <ChevronTiny />
                <span className="text-gray-700 dark:text-gray-200 font-medium">Role pipelines</span>
              </nav>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Role pipelines</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Create roles, collect submissions through your intake link, and build a shortlist when the pool is full.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => router.push("/user/jd")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200">
                <IconPlus /> New pipeline
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <FilterChip label="All"           active={filter === "all"}      count={counts.all}      onClick={() => setFilter("all")}      />
            <FilterChip label="Open"          active={filter === "open"}     count={counts.open}     onClick={() => setFilter("open")}     dot="sky" />
            <FilterChip label="Filling"       active={filter === "awaiting"} count={counts.awaiting} onClick={() => setFilter("awaiting")} dot="amber" />
            <FilterChip label="Ready to shortlist" active={filter === "ready"}    count={counts.ready}    onClick={() => setFilter("ready")}    dot="emerald" />
            <FilterChip label="Closed"        active={filter === "closed"}   count={counts.closed}   onClick={() => setFilter("closed")}   dot="gray" />
            <FilterChip label="Paused"        active={filter === "paused"}   count={counts.paused}   onClick={() => setFilter("paused")}   dot="rose" />
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles by title or level…"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40"
            />
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-lg">
            {(["recent", "applied", "cap"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sort === k ? "bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"}`}
              >
                {k === "recent" ? "Most recent" : k === "applied" ? "Most applied" : "Largest cap"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.04] rounded-lg ml-auto">
            <button type="button" onClick={() => setView("table")} className={`p-1.5 rounded-md ${view === "table" ? "bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`} title="Table">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button type="button" onClick={() => setView("cards")} className={`p-1.5 rounded-md ${view === "cards" ? "bg-white dark:bg-white/[0.08] text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`} title="Cards">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-500/[0.08] border border-sky-200/60 dark:border-sky-500/20">
            <p className="text-sm text-sky-900 dark:text-sky-200">
              <span className="font-semibold tabular-nums">{selected.size}</span> selected
            </p>
            <div className="flex items-center gap-2">
              <BulkBtn label="Copy intake links" onClick={handleBulkCopy} disabled={bulkBusy} />
              <BulkBtn label="Close" onClick={handleBulkClose} disabled={bulkBusy} />
              <BulkBtn label="Export CSV" onClick={handleBulkExport} disabled={bulkBusy} />
              <BulkBtn label="Delete" tone="danger" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy} />
              <button type="button" onClick={() => setSelected(new Set())} className="px-2 py-1 text-xs text-sky-700 dark:text-sky-300 hover:underline">Clear</button>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState empty={rows.length === 0} />
        ) : view === "table" ? (
          <TableView pipelines={filtered} selected={selected} onToggle={toggleSelected} onToggleAll={toggleAll} actions={actions} />
        ) : (
          <CardsView pipelines={filtered} selected={selected} onToggle={toggleSelected} actions={actions} />
        )}

        {/* Footer stats */}
        {!loading && !error && (
          <div className="mt-6 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <p>Showing <span className="font-medium text-gray-700 dark:text-gray-200 tabular-nums">{filtered.length}</span> of <span className="tabular-nums">{rows.length}</span> pipelines</p>
            <p>Need a shortlist on a pipeline? It unlocks at 60% of the applicant cap.</p>
          </div>
        )}
      </div>

      {/* Generate (shortlist) modal */}
      {generateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !generateLoading && setGenerateModal(null)}>
          <div className="bg-white dark:bg-[#161616] rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{generateLoading ? "Generating top candidates…" : "Generate top candidates now?"}</h3>
            {generateLoading ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Ranking your applicant pool. This usually takes 10–30 seconds. Please don&apos;t close this window.</p>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gray-900 dark:bg-gray-100 rounded-full" style={{ width: "40%", animation: "eigen-progress-slide 1.4s ease-in-out infinite" }} />
                </div>
                <style>{`@keyframes eigen-progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 tabular-nums">Elapsed: {generateElapsed}s</p>
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This will freeze new submissions for <span className="font-medium text-gray-900 dark:text-gray-100">{generateModal.title}</span> and generate the ranked shortlist. Continue?</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={generateLoading} onClick={() => setGenerateModal(null)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Cancel / Wait</button>
              <button type="button" disabled={generateLoading} onClick={handleGenerateContinue} className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50">{generateLoading ? "Generating…" : "Continue"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Single delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !deleteLoading && setDeleteModal(null)}>
          <div className="bg-white dark:bg-[#161616] rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete this pipeline?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This will permanently delete <span className="font-medium text-gray-900 dark:text-gray-100">{deleteModal.title}</span>, all candidate submissions, and resume files. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={deleteLoading} onClick={() => setDeleteModal(null)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={deleteLoading} onClick={handleDeleteConfirm} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">{deleteLoading ? "Deleting…" : "Delete Permanently"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete modal */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !bulkBusy && setBulkDeleteOpen(false)}>
          <div className="bg-white dark:bg-[#161616] rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete {selected.size} pipeline{selected.size === 1 ? "" : "s"}?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This permanently deletes the selected pipelines, all their candidate submissions, and resume files. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(false)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={bulkBusy} onClick={handleBulkDeleteConfirm} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">{bulkBusy ? "Deleting…" : "Delete Permanently"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Views
// --------------------------------------------------------------------------

function TableView({
  pipelines,
  selected,
  onToggle,
  onToggleAll,
  actions,
}: {
  pipelines: Pipeline[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  actions: RowActions;
}) {
  const allSelected = pipelines.length > 0 && pipelines.every((p) => selected.has(p.id));

  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
      {/* Head */}
      <div className="hidden md:grid grid-cols-12 items-center px-4 lg:px-6 py-2.5 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-white/[0.05]">
        <div className="col-span-5 flex items-center gap-3">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded border-gray-300 dark:border-white/15 text-sky-600 focus:ring-sky-500/40" />
          <span>Role</span>
        </div>
        <div className="col-span-1">Status</div>
        <div className="col-span-2">Submissions</div>
        <div className="col-span-1">Top ETI</div>
        <div className="col-span-1">Last activity</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
        {pipelines.map((p) => {
          const pct = Math.min(100, Math.round((p.applied / p.cap) * 100));
          const st = STATUS_STYLE[p.status];
          const isSelected = selected.has(p.id);
          const canRank = pct >= 60 && p.status !== "closed";
          return (
            <div
              key={p.id}
              className={`grid grid-cols-1 md:grid-cols-12 items-center gap-3 px-4 lg:px-6 py-4 transition-colors ${isSelected ? "bg-sky-50/40 dark:bg-sky-500/[0.04]" : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"}`}
            >
              {/* Role */}
              <div className="md:col-span-5 flex items-start gap-3 min-w-0">
                <input type="checkbox" checked={isSelected} onChange={() => onToggle(p.id)} className="mt-1 rounded border-gray-300 dark:border-white/15 text-sky-600 focus:ring-sky-500/40" />
                <div className="min-w-0">
                  <a href={`/user/jd/results?jobId=${encodeURIComponent(p.id)}`} className="block font-medium text-gray-900 dark:text-gray-100 truncate hover:underline">{p.title}</a>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{p.level}</span>
                    <Dot />
                    <span>{p.daysOpen === 0 ? "opened today" : `${p.daysOpen}d open`}</span>
                    {p.source && (
                      <>
                        <Dot />
                        <span className="inline-flex items-center gap-1">
                          <SourceIcon kind={p.source} /> {p.source}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="md:col-span-1">
                <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium ${st.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>

              {/* Submissions */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-gray-300 tabular-nums">{p.applied} / {p.cap}</span>
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.status === "ready" ? "bg-emerald-500" : p.status === "awaiting" ? "bg-amber-500" : p.status === "closed" ? "bg-gray-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                </div>
                {p.flagsCount > 0 && (
                  <p className="mt-1 text-[10.5px] text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
                    <IconFlag /> {p.flagsCount} review flag{p.flagsCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              {/* Top ETI */}
              <div className="md:col-span-1 text-sm font-medium tabular-nums">
                {p.topEti != null ? (
                  <span className={`${p.topEti >= 80 ? "text-teal-600 dark:text-teal-400" : p.topEti >= 65 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {p.topEti}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">—</span>
                )}
              </div>

              {/* Last activity */}
              <div className="md:col-span-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{p.lastActivity}</div>

              {/* Actions */}
              <div className="md:col-span-2 flex justify-end items-center gap-1.5">
                {canRank ? (
                  <button type="button" onClick={() => actions.onShortlist(p)} className="hidden lg:inline-flex px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25">
                    Shortlist
                  </button>
                ) : p.status === "closed" || p.shortlistCount > 0 ? (
                  <button type="button" onClick={() => actions.onView(p.id)} className="hidden lg:inline-flex px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                    View top
                  </button>
                ) : null}
                <RowActionMenu p={p} actions={actions} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardsView({
  pipelines,
  selected,
  onToggle,
  actions,
}: {
  pipelines: Pipeline[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  actions: RowActions;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {pipelines.map((p) => {
        const pct = Math.min(100, Math.round((p.applied / p.cap) * 100));
        const st = STATUS_STYLE[p.status];
        const isSelected = selected.has(p.id);
        const canRank = pct >= 60 && p.status !== "closed";
        return (
          <div key={p.id} className={`group bg-white dark:bg-white/[0.02] rounded-2xl border ${isSelected ? "border-sky-300 dark:border-sky-500/40" : "border-gray-200/80 dark:border-white/[0.06]"} p-5 transition-all hover:shadow-sm dark:hover:bg-white/[0.04]`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <input type="checkbox" checked={isSelected} onChange={() => onToggle(p.id)} className="mt-1 rounded border-gray-300 dark:border-white/15 text-sky-600 focus:ring-sky-500/40" />
                <div className="min-w-0">
                  <a href={`/user/jd/results?jobId=${encodeURIComponent(p.id)}`} className="block font-medium text-gray-900 dark:text-gray-100 truncate hover:underline">{p.title}</a>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.level} · {p.daysOpen === 0 ? "opened today" : `${p.daysOpen}d open`}</p>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium ${st.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">{p.applied} / {p.cap} submissions</span>
                <span className="text-gray-500 dark:text-gray-400 tabular-nums">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${p.status === "ready" ? "bg-emerald-500" : p.status === "awaiting" ? "bg-amber-500" : p.status === "closed" ? "bg-gray-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Mini label="Top ETI" value={p.topEti != null ? String(p.topEti) : "—"} tone={p.topEti != null && p.topEti >= 80 ? "teal" : p.topEti != null && p.topEti >= 65 ? "emerald" : "gray"} />
              <Mini label="Shortlisted" value={String(p.shortlistCount)} />
              <Mini label="Flags" value={String(p.flagsCount)} tone={p.flagsCount > 0 ? "rose" : "gray"} />
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              {p.source ? (
                <span className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
                  <SourceIcon kind={p.source} /> {p.source}
                </span>
              ) : (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{p.shortlistCount > 0 ? `${p.shortlistCount} shortlisted` : `${p.applied} applied`}</span>
              )}
              <div className="flex items-center gap-1.5">
                {canRank ? (
                  <button type="button" onClick={() => actions.onShortlist(p)} className="px-2.5 py-1 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25">Shortlist</button>
                ) : p.status === "closed" || p.shortlistCount > 0 ? (
                  <button type="button" onClick={() => actions.onView(p.id)} className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]">View top</button>
                ) : null}
                <RowActionMenu p={p} actions={actions} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Real dropdown that gives the v2 "More actions" kebab its menu.
function RowActionMenu({ p, actions }: { p: Pipeline; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const paused = actions.screensRemaining <= 0;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="More actions" aria-haspopup="menu" aria-expanded={open}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-44 z-20 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#161616] shadow-lg py-1">
          <button type="button" role="menuitem" disabled={paused} onClick={() => { if (!paused) { actions.onCopy(p.id); setOpen(false); } }} title={paused ? "Intake links are paused — add screens to resume." : undefined} className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${paused ? "text-gray-400 dark:text-gray-600 cursor-not-allowed" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.05]"}`}>
            <IconLink /> Copy intake link
          </button>
          <button type="button" role="menuitem" onClick={() => { actions.onEdit(p.id); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.05]">
            <IconGear /> Edit role settings
          </button>
          <div className="my-1 h-px bg-gray-100 dark:bg-white/[0.06]" />
          <button type="button" role="menuitem" onClick={() => { actions.onDelete(p); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10">
            <IconTrash /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ empty }: { empty: boolean }) {
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-dashed border-gray-300 dark:border-white/[0.08] p-12 text-center">
      <div className="w-12 h-12 bg-sky-50 dark:bg-sky-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-sky-600 dark:text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9-3a9 9 0 1118 0 9 9 0 01-18 0z" /></svg>
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{empty ? "No pipelines yet" : "No pipelines match this filter"}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-5 max-w-sm mx-auto">{empty ? "Create a role pipeline — share the intake link with applicants and we evaluate each submission automatically." : "Try a different filter or search term."}</p>
      <a href="/user/jd" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200">
        <IconPlus /> Create pipeline
      </a>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[72px] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] animate-pulse" />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-rose-200 dark:border-rose-500/20 p-10 text-center">
      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{message}</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]">
        Retry
      </button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Atoms
// --------------------------------------------------------------------------

function FilterChip({
  label,
  active,
  count,
  onClick,
  dot,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
  dot?: "sky" | "amber" | "emerald" | "gray" | "rose";
}) {
  const dotColor = {
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    gray: "bg-gray-400",
    rose: "bg-rose-500",
  }[dot ?? "sky"];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
        active
          ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
          : "bg-white dark:bg-white/[0.03] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.06]"
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80 dark:bg-gray-900/70" : dotColor}`} />}
      {label}
      <span className={`tabular-nums ${active ? "text-white/70 dark:text-gray-900/70" : "text-gray-400 dark:text-gray-500"}`}>{count}</span>
    </button>
  );
}

function BulkBtn({ label, tone, onClick, disabled }: { label: string; tone?: "danger"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 ${
        tone === "danger"
          ? "text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15"
          : "text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/15"
      }`}
    >
      {label}
    </button>
  );
}

function Mini({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "teal" | "emerald" | "rose" }) {
  const valueTone = {
    gray: "text-gray-900 dark:text-gray-100",
    teal: "text-teal-600 dark:text-teal-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] py-2 px-1">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 tabular-nums ${valueTone}`}>{value}</p>
    </div>
  );
}

function Dot() {
  return <span className="text-gray-300 dark:text-white/15">·</span>;
}
function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

function SourceIcon({ kind }: { kind: Pipeline["source"] }) {
  if (kind === "ATS · Ashby") return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
  if (kind === "Email forward") return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
  return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5m4.656-4.656l1.5-1.5a4 4 0 115.656 5.656l-3 3a4 4 0 01-5.656 0" /></svg>;
}

const I = "w-3.5 h-3.5";
function IconPlus() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" /></svg>; }
function IconLink() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5m4.656-4.656l1.5-1.5a4 4 0 115.656 5.656l-3 3a4 4 0 01-5.656 0" /></svg>; }
function IconGear() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.8} fill="none" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>; }
function IconTrash() { return <svg className={I} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>; }
function IconFlag() { return <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 21V5a2 2 0 012-2h7l1 2h5v9h-6l-1-2H7v9H5z" /></svg>; }
