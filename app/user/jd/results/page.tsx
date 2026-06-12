"use client";
export const dynamic = 'force-dynamic';
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import { usePageTitle } from "@/lib/use-page-title";
import { useResultsData, type Candidate } from "@/lib/use-results-data";
import { seniorityToCluster, detectWeakPool, type WeakPoolResult } from "@/lib/weak-pool";
import { auth } from "@/lib/firebase";
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

// v2 decision line (base + edge + caveat) when present; otherwise fall back to
// the role-fit one-liner so pre-v2 docs (no decision_line) still render.
function getDecisionText(c: Candidate): string {
  const text = c.profile?.decision_line?.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  return getRoleFitOneLiner(c);
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

function getTrustLabel(score: number): { text: string; className: string } {
  if (score >= 80) return { text: "Very High Trust", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" };
  if (score >= 65) return { text: "High Trust", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
  if (score >= 50) return { text: "Medium Trust", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" };
  return { text: "Low Trust", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
}

function ResultsNavBar() {
  const router = useRouter();
  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-white/[0.1] bg-white/80 dark:bg-[#0a0a0e]/80 backdrop-blur-md transition-all duration-300">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <button
          onClick={() => router.push("/user/dashboard")}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all duration-200 flex items-center gap-1.5 group hover:gap-2"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </button>
        <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">EigenWork</span>
        <div className="w-20" />
      </div>
    </nav>
  );
}

function WeakPoolBanner({
  weakPool,
  onStartNewIntake,
  onDismiss,
}: {
  weakPool: WeakPoolResult & { weak: true };
  onStartNewIntake: () => void;
  onDismiss: () => void;
}) {
  const isJunior = weakPool.cluster === "junior";
  const body = isJunior
    ? `${weakPool.pctBelowThreshold}% of applicants did not meet the baseline ETI (50). This usually indicates low-quality sourcing.`
    : `${weakPool.pctBelowThreshold}% of applicants are below the contributor threshold (ETI 65). The pool lacks strong-fit candidates.`;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 relative">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 text-amber-400 dark:text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">Weak Candidate Pool</h3>
      <p className="text-sm text-amber-800 dark:text-amber-300 mb-4 pr-6">{body}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStartNewIntake}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Start New Intake
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2 border border-gray-200 dark:border-white/[0.1] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Keep This Pool
        </button>
      </div>
    </div>
  );
}

function NewIntakeModal({
  onCancel,
  onConfirm,
  isSubmitting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-white/[0.02] rounded-xl shadow-xl dark:shadow-none w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Start New Intake</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          You can start collecting a new set of applicants.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
          No additional cost. Credits used for this pool will be restored.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-200 dark:border-white/[0.1] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Starting…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function JDResultsContent() {
  usePageTitle("Top Candidates");
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  
  const { top10, etiDistribution, seniority, isLoading, error, revalidate } = useResultsData(jobId);

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const weakPool = detectWeakPool(etiDistribution, seniorityToCluster(seniority));

  const handleConfirmNewIntake = useCallback(async () => {
    if (!jobId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/jd/new-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowModal(false);
      setBannerDismissed(true);
      router.push("/user/dashboard");
    } catch {
      setIsSubmitting(false);
    }
  }, [jobId, isSubmitting, router]);

  const exportCsv = () => {
    const headers = ["Rank", "Name", "Email", "Phone", "ETI Score", "Trust", "Location", "Work Types", "Work Auth", "Decision", "Role Fit"];
    const rows = top10.map((c, i) => {
      const wt = c.matchData?.workTypes;
      const workTypes = Array.isArray(wt) ? wt.join("; ") : wt != null ? String(wt) : "";
      return [
        String(i + 1),
        c.candidateName ?? "",
        c.email ?? "",
        c.phone != null ? String(c.phone) : "",
        String(c.score ?? ""),
        getTrustLabel(c.score).text,
        (c.matchData?.locations ?? []).join("; "),
        workTypes,
        (c.matchData?.work_auth ?? "").trim(),
        getDecisionText(c),
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

  if (!jobId) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm">Missing jobId in URL. Use /user/jd/results?jobId=...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={() => revalidate()}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (top10.length === 0 && etiDistribution.total === 0) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm text-center">No applicants in the pool for this job yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-300 flex flex-col">
      <ResultsNavBar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-6 gap-3">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Pipeline Results</h1>
          {top10.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="px-3 py-1.5 border border-gray-300 dark:border-white/[0.1] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shrink-0"
            >
              Export CSV
            </button>
          )}
        </div>
        <EtiPoolDistributionBar distribution={etiDistribution} />
        {weakPool.weak && !bannerDismissed && (
          <WeakPoolBanner
            weakPool={weakPool}
            onStartNewIntake={() => setShowModal(true)}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
        {showModal && (
          <NewIntakeModal
            onCancel={() => setShowModal(false)}
            onConfirm={handleConfirmNewIntake}
            isSubmitting={isSubmitting}
          />
        )}
        {top10.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">
            No matching candidates passed the filters (role fit, ETI ≥ 50, and work authorization).
          </p>
        ) : (
        <ul className="space-y-4">
          {top10.map((c) => {
            const trust = getTrustLabel(c.score);
            const location = (c.matchData?.locations ?? []).join(", ") || "—";
            const workTypesRaw = c.matchData?.workTypes;
            const workTypes = Array.isArray(workTypesRaw) ? workTypesRaw.join(", ") : (workTypesRaw ? String(workTypesRaw) : "—");
            const workAuth = (c.matchData?.work_auth ?? "").trim() || "—";
            const decisionText = getDecisionText(c);
            const evidenceUnavailable = c.esq_status === "unavailable";
            const name = (c.candidateName ?? "").trim();
            const email = (c.email ?? "").trim();
            const phone = c.phone != null ? String(c.phone).trim() : "";
            const identityParts = [name || "—", email || "—", ...(phone ? [phone] : [])];
            const identityLine = identityParts.join(" • ");
            return (
              <li
                key={c.id}
                className="bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200 dark:border-white/[0.05] shadow-sm dark:shadow-none overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">ETI {c.score}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trust.className}`}>
                      {trust.text}
                    </span>
                    {c.yoe != null && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {c.yoe} yr{c.yoe !== 1 ? "s" : ""} exp
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 flex flex-row flex-wrap items-center gap-x-1 gap-y-0">
                    {identityLine}
                  </p>
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1 mb-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {decisionText}
                    </p>
                    {evidenceUnavailable && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        evidence unavailable
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {location} • {workTypes} • {workAuth}
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-white/[0.1] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Download Resume ⬇
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}


export default function JDResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen transition-colors duration-300 flex flex-col items-center justify-center"><p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p></div>}>
      <JDResultsContent />
    </Suspense>
  );
}
