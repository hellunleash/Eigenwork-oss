"use client";
export const dynamic = 'force-dynamic';
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { usePageTitle } from "@/lib/use-page-title";
import { useResultsData, type Candidate } from "@/lib/use-results-data";

function getRoleFitOneLiner(c: Candidate): string {
  const rf = c.role_fit ?? c.profile?.role_fit;
  if (typeof rf === "string") return rf.trim() || "Not provided";
  if (rf && typeof rf === "object" && "one_liner" in rf) return (rf.one_liner ?? "").trim() || "Not provided";
  return "Not provided";
}

function getTrustLabel(score: number): { text: string; className: string } {
  if (score >= 80) return { text: "Very High Trust", className: "bg-teal-100 text-teal-700" };
  if (score >= 65) return { text: "High Trust", className: "bg-green-100 text-green-700" };
  if (score >= 50) return { text: "Medium Trust", className: "bg-yellow-100 text-yellow-700" };
  return { text: "Low Trust", className: "bg-red-100 text-red-700" };
}

function ResultsNavBar() {
  const router = useRouter();
  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md transition-all duration-300">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <button
          onClick={() => router.push("/user/dashboard")}
          className="text-sm text-gray-600 hover:text-gray-900 transition-all duration-200 flex items-center gap-1.5 group hover:gap-2"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </button>
        <span className="text-lg font-semibold tracking-tight text-gray-900">EigenWork</span>
        <div className="w-20" />
      </div>
    </nav>
  );
}

function JDResultsContent() {
  usePageTitle("Top Candidates");
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  
  // Use SWR-based results data hook
  const { top10, isLoading, error, revalidate } = useResultsData(jobId);

  if (!jobId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-600 text-sm">Missing jobId in URL. Use /user/jd/results?jobId=...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-gray-500 text-sm">Loading results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={() => revalidate()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (top10.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ResultsNavBar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-600 text-sm text-center">No matching candidates passed the filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ResultsNavBar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Pipeline Results</h1>
        <ul className="space-y-4">
          {top10.map((c) => {
            const trust = getTrustLabel(c.score);
            const location = (c.matchData?.locations ?? []).join(", ") || "—";
            const workTypesRaw = c.matchData?.workTypes;
            const workTypes = Array.isArray(workTypesRaw) ? workTypesRaw.join(", ") : (workTypesRaw ? String(workTypesRaw) : "—");
            const workAuth = (c.matchData?.work_auth ?? "").trim() || "—";
            const roleFit = getRoleFitOneLiner(c);
            const name = (c.candidateName ?? "").trim();
            const email = (c.email ?? "").trim();
            const phone = c.phone != null ? String(c.phone).trim() : "";
            const identityParts = [name || "—", email || "—", ...(phone ? [phone] : [])];
            const identityLine = identityParts.join(" • ");
            return (
              <li
                key={c.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-lg font-bold text-gray-900">ETI {c.score}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trust.className}`}>
                      {trust.text}
                    </span>
                    {c.yoe != null && (
                      <span className="text-sm text-gray-500">
                        {c.yoe} yr{c.yoe !== 1 ? "s" : ""} exp
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2 flex flex-row flex-wrap items-center gap-x-1 gap-y-0">
                    {identityLine}
                  </p>
                  <p className="text-sm font-medium text-gray-700 truncate max-w-full mb-2">
                    {roleFit}
                  </p>
                  <p className="text-sm text-gray-500 mb-3">
                    {location} • {workTypes} • {workAuth}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={jobId ? `/user/candidatecard/${encodeURIComponent(c.id)}?jobId=${encodeURIComponent(jobId)}` : `/candidate/dashboard?id=${encodeURIComponent(c.id)}`}
                      className="inline-flex items-center px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                    >
                      View Candidate Card
                    </a>
                    {c.resume_url && (
                      <a
                        href={c.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Download Resume ⬇
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}


export default function JDResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center"><p className="text-gray-500 text-sm">Loading…</p></div>}>
      <JDResultsContent />
    </Suspense>
  );
}
