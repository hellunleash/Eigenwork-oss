"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { mutate as swrMutate } from "swr";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { FreeClaimGate } from "./FreeClaimGate";

type Pipeline = {
  id: string;
  title: string;
  createdAt: number | null;
  submissionCap: number;
  isClosed: boolean;
  appliedCount: number;
  hasMatchResult?: boolean;
};

export default function UserDashboardPage() {
  usePageTitle("Dashboard");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [generateModal, setGenerateModal] = useState<Pipeline | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [deleteModal, setDeleteModal] = useState<Pipeline | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { pipelines, entitlement, isLoading, error, revalidate, mutatePipelines } = useDashboardData(userId);
  const screensRemaining = entitlement?.screensRemaining ?? 0;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace("/"); return; }
      setAuthChecking(false);
      setUserId(user.uid);
    });
    return () => unsub();
  }, [router]);

  const handleCopyIntakeLink = (jobId: string) => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/candidate?jobId=${jobId}` : "";
    navigator.clipboard.writeText(url).then(
      () => alert("Intake link copied to clipboard."),
      () => alert("Could not copy. Please copy the link manually.")
    );
  };

  const submissionRatio = (p: Pipeline) => (p.submissionCap > 0 ? p.appliedCount / p.submissionCap : 0);

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
      setGenerateModal(null);
      await revalidate();
      await swrMutate(`/api/jd/match?jobId=${encodeURIComponent(generateModal.id)}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      clearInterval(ticker);
      setGenerateLoading(false);
      setGenerateElapsed(0);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const cloudRunBase = process.env.NEXT_PUBLIC_CLOUD_RUN_URL?.replace(/\/+$/, "") ?? "";
      const res = cloudRunBase
        ? await fetch(`${cloudRunBase}/jd/cascade-delete`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jobId: deleteModal.id }) })
        : await fetch(`/api/jd/${encodeURIComponent(deleteModal.id)}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteModal(null);
      await mutatePipelines(
        (current: { pipelines: Pipeline[] } | Pipeline[] | undefined) => {
          const cur = Array.isArray(current) ? current : (current && "pipelines" in current ? current.pipelines : []);
          return { pipelines: cur.filter((p: Pipeline) => p.id !== deleteModal.id) };
        },
        { revalidate: true }
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
      await revalidate();
    } finally {
      setDeleteLoading(false);
    }
  };

  const btn = "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";
  const btnSecondary = `${btn} text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700`;

  if (authChecking) return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">Checking authentication…</p>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">Loading pipelines…</p>
    </div>
  );

  if (error && pipelines.length === 0 && screensRemaining === 0) return (
    <div className="min-h-screen transition-colors duration-300 flex flex-col items-center justify-center p-4">
      <p className="text-red-500 text-sm mb-4">{error}</p>
      <button type="button" onClick={() => revalidate()} className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium">Retry</button>
    </div>
  );

  if (!isLoading && entitlement && entitlement.plan === null) return <FreeClaimGate onClaimed={() => revalidate()} />;

  return (
    <div className="min-h-screen transition-colors duration-300">
      <div className="border-b border-gray-200 dark:border-white/[0.05] bg-white dark:bg-[#0a0a0e]/80 dark:backdrop-blur-md sticky top-0 z-30 transition-colors duration-300">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">Dashboard</h1>
        </div>
      </div>

      {screensRemaining === 0 && pipelines.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800">
          <div className="max-w-3xl mx-auto px-4 py-3 sm:px-6 flex items-start gap-3">
            <span className="text-amber-600 text-lg shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Your intake links are paused</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">Add screens to resume accepting candidate applications.</p>
            </div>
            <button type="button" onClick={() => router.push("/user/billing")} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 shrink-0">Add Screens</button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 animate-fade-in-up">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tight">Your Evaluation Pipelines</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">Create and manage your role pipelines. Share the intake link to collect and auto-evaluate candidate submissions.</p>
        </header>

        <div className="mb-6">
          <button type="button" onClick={() => router.push("/user/jd")} className="px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
            Create New Pipeline
          </button>
        </div>

        {pipelines.length === 0 ? (
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/[0.05] shadow-sm dark:shadow-2xl p-12 text-center transition-all duration-300 hover:dark:bg-white/[0.04]">
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/[0.05] rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No pipelines created yet</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm mx-auto">Get started by creating a new evaluation pipeline to start assessing candidates automatically.</p>
            <button type="button" onClick={() => router.push("/user/jd")} className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg dark:shadow-white/10">
              Start a New Pipeline
            </button>
          </div>
        ) : (
          <ul className="space-y-4">
            {pipelines.map((p) => {
              const ratio = submissionRatio(p);
              const matchingCompleted = p.isClosed || p.hasMatchResult === true;
              const isWaiting = ratio < 0.6 && !matchingCompleted;
              const canGenerate = ratio >= 0.6 && !matchingCompleted;
              const isClosed = matchingCompleted;
              const statusLabel = p.appliedCount === 0 ? "0 submissions yet" : `${p.appliedCount} candidate${p.appliedCount === 1 ? "" : "s"} evaluated`;

              return (
                <li key={p.id} className="group bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200 dark:border-white/[0.05] shadow-sm hover:shadow-md dark:shadow-none hover:dark:bg-white/[0.04] hover:dark:border-white/[0.1] transition-all duration-300 p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900 dark:text-gray-50 font-medium truncate group-hover:dark:text-white transition-colors">{p.title || "Untitled role"}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{statusLabel} {p.submissionCap > 0 ? <span className="opacity-70 ml-1">(Limit {p.submissionCap})</span> : ""}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                    {isWaiting && <button type="button" disabled title="Available after 60% of the applicant limit is reached." className={`${btn} text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 opacity-50 cursor-not-allowed`}>Waiting for submissions</button>}
                    {canGenerate && <button type="button" onClick={() => setGenerateModal(p)} className={`${btnSecondary} dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:border dark:border-white/10`}>Generate Top Candidates</button>}
                    {isClosed && <button type="button" onClick={() => router.push(`/user/jd/results/${p.id}`)} className={`${btnSecondary} dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:border dark:border-white/10`}>View Top Candidates</button>}
                    <button type="button" onClick={() => router.push(`/user/jd/confirm?jobId=${encodeURIComponent(p.id)}`)} className={`${btnSecondary} dark:bg-transparent dark:hover:bg-white/5`}>Edit Settings</button>
                    <button type="button" disabled={screensRemaining <= 0} onClick={() => screensRemaining > 0 && handleCopyIntakeLink(p.id)}
                      className={`${btn} ${screensRemaining <= 0 ? "text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-white/5 opacity-50 cursor-not-allowed" : `${btnSecondary} dark:bg-transparent dark:hover:bg-white/5`}`}>
                      Copy Link
                    </button>
                    <button type="button" onClick={() => setDeleteModal(p)} className={`${btn} text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors`}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Generate modal */}
      {generateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !generateLoading && setGenerateModal(null)}>
          <div className="bg-white dark:bg-white/[0.02] rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-white/[0.05]" onClick={(e) => e.stopPropagation()}>
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This will freeze new submissions for this role. Continue and generate the top candidate list?</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={generateLoading} onClick={() => setGenerateModal(null)} className={`${btnSecondary} disabled:opacity-50`}>Cancel / Wait</button>
              <button type="button" disabled={generateLoading} onClick={handleGenerateContinue} className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50">{generateLoading ? "Generating…" : "Continue"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !deleteLoading && setDeleteModal(null)}>
          <div className="bg-white dark:bg-white/[0.02] rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-white/[0.05]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete this pipeline?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">This will permanently delete the pipeline, all candidate submissions, and resume files. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={deleteLoading} onClick={() => setDeleteModal(null)} className={`${btnSecondary} disabled:opacity-50`}>Cancel</button>
              <button type="button" disabled={deleteLoading} onClick={handleDeleteConfirm} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">{deleteLoading ? "Deleting…" : "Delete Permanently"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
