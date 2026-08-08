"use client";

// Recruiter-facing finalist report view (Phase 2, Step 4b + doubles as 4d: print-to-PDF
// is the LL144 audit artifact). Fetches the owner-gated /api/interview/report/[id] with
// the Firebase token, renders the compiled dossier. Product UI tokens (gray, #0a0a0a,
// emerald accent, subtle bordered cards) — matches the logged-in surfaces. Assistive:
// every score is a recommendation; advance/reject stays a human action elsewhere.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { buildReportSummaryText } from "@/lib/interview/report-format";
import type { FinalistReport } from "@/lib/interview/report";
import type { Scorecard } from "@/lib/interview/rounds";

const REC_STYLE: Record<FinalistReport["recommendation"]["suggested"], { label: string; cls: string }> = {
  advance: { label: "Advance (suggested)", cls: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300" },
  hold: { label: "Hold — judgment call", cls: "border-amber-500/30 bg-amber-500/[0.08] text-amber-300" },
  pass: { label: "Pass (suggested)", cls: "border-rose-500/30 bg-rose-500/[0.08] text-rose-300" },
  incomplete: { label: "Incomplete", cls: "border-white/10 bg-white/[0.04] text-gray-400" },
};

function ScoreCardView({ title, sc, extra }: { title: string; sc: Scorecard | null | undefined; extra?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        {sc ? (
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${sc.suggestedAdvance ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-gray-400"}`}>
            {sc.overall}/100 · {sc.suggestedAdvance ? "advance" : "below bar"}
          </span>
        ) : (
          <span className="text-xs text-gray-500">not scored</span>
        )}
      </div>
      {extra && <p className="mb-2 break-all text-xs text-sky-300">{extra}</p>}
      {sc && (
        <>
          {sc.summary && <p className="text-sm text-gray-300">{sc.summary}</p>}
          {sc.dimensions.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              {sc.dimensions.map((d, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-gray-400">{d.name}</span>
                  <span className="tabular-nums text-gray-300">{d.score}/{d.max}</span>
                </div>
              ))}
            </div>
          )}
          {sc.flags && sc.flags.length > 0 && (
            <ul className="mt-3 space-y-1">
              {sc.flags.map((f, i) => (
                <li key={i} className="text-xs text-amber-300/90">⚑ {f}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function FinalistReportPage() {
  const id = (useParams()?.id as string) || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<FinalistReport | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdTokenOrNull();
      const res = await fetch(`/api/interview/report/${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status === 401) {
        setError("Please sign in to view this report.");
        return;
      }
      if (res.status === 404) {
        setError("Report not found (or interviews aren't enabled).");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong loading the report.");
        return;
      }
      const data = (await res.json()) as { report: FinalistReport };
      setReport(data.report);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  const copySummary = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(buildReportSummaryText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const rec = report ? REC_STYLE[report.recommendation.suggested] : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 flex justify-center px-4 py-10 sm:py-14 print:bg-white print:text-black">
      <div className="w-full max-w-2xl">
        {loading && <p className="text-sm text-gray-400">Loading the finalist report…</p>}
        {!loading && error && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        {!loading && report && rec && (
          <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Finalist report</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-50">{report.candidateName}</h1>
                <p className="mt-1 text-sm text-gray-400">
                  {report.roleTitle} · {report.track}
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={copySummary}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/[0.04]"
                >
                  {copied ? "Copied" : "Copy text"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/[0.04]"
                >
                  Print / PDF
                </button>
              </div>
            </header>

            <div className={`rounded-xl border p-4 ${rec.cls}`}>
              <div className="text-sm font-semibold">{rec.label}</div>
              <p className="mt-0.5 text-xs opacity-90">{report.recommendation.rationale}</p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-100">Résumé / ETI signal</h3>
              <div className="text-sm text-gray-300">
                <div>Score: <span className="tabular-nums">{report.resume.score ?? "n/a"}</span></div>
                {report.resume.card?.title && <div className="mt-1">Headline: {report.resume.card.title}</div>}
                {report.resume.card?.edge && <div className="mt-1">Standout: {report.resume.card.edge}</div>}
                {report.resume.card?.flag && <div className="mt-1 text-amber-300/90">⚑ {report.resume.card.flag}</div>}
              </div>
            </div>

            {report.rounds.introCall && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-gray-300">
                <span className="font-semibold text-gray-100">Intro call:</span> {report.rounds.introCall.status}
                {report.rounds.introCall.note ? ` — ${report.rounds.introCall.note}` : ""}
              </div>
            )}

            <ScoreCardView title="Technical screen" sc={report.rounds.screen} />
            <ScoreCardView title="Take-home" sc={report.rounds.takeHome?.scorecard} extra={report.rounds.takeHome?.repoUrl} />
            <ScoreCardView title="System design" sc={report.rounds.systemDesign} />

            {report.whatToProbe.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="mb-2 text-sm font-semibold text-gray-100">What to probe in the final</h3>
                <ul className="space-y-1.5">
                  {report.whatToProbe.map((p, i) => (
                    <li key={i} className="text-sm text-gray-300">• {p}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-500">{report.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
