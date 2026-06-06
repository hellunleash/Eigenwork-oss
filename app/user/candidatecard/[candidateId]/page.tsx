"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, Suspense, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePageTitle } from "@/lib/use-page-title";
import { getIdTokenOrNull } from "@/lib/auth-client";

function UserCandidateCardContent() {
  usePageTitle("Candidate Profile");
  const params = useParams();
  const searchParams = useSearchParams();
  const candidateId =
    typeof (params as Record<string, unknown>)?.candidateId === "string"
      ? String((params as Record<string, unknown>).candidateId)
      : "";
  const jobId = searchParams.get("jobId");

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(() => Boolean(candidateId));
  const [error, setError] = useState<string | null>(null);
  
  // ETI Info tooltip state
  const [showEtiTooltip, setShowEtiTooltip] = useState(false);
  const etiTooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    (async () => {
      try {
        // The candidate detail endpoint requires owner auth — a stale 404
        // here usually means the user isn't logged in or doesn't own the JD.
        const token = await getIdTokenOrNull();
        const res = await fetch(`/api/candidate/${encodeURIComponent(candidateId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Candidate not found" : "Failed to load");
        }
        const doc = await res.json();
        if (!cancelled) setData(doc);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  // ETI Tooltip click outside handler (must be before early return)
  useEffect(() => {
    if (!showEtiTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (etiTooltipRef.current && !etiTooltipRef.current.contains(e.target as Node)) {
        setShowEtiTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEtiTooltip]);

  if (loading || !data) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        {error ? (
          <>
            <p className="mb-2">{error}</p>
            {jobId ? (
              <Link
                href={`/user/jd/results/${jobId}`}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium"
              >
                Back to Results
              </Link>
            ) : (
              <Link
                href="/user/dashboard"
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium"
              >
                Back to Dashboard
              </Link>
            )}
          </>
        ) : (
          <div className="animate-pulse mb-2">Loading profile…</div>
        )}
      </div>
    );
  }

  const profile = (data.profile as Record<string, unknown>) || {};
  const score = (data.score as number) ?? 0;
  const yoe = typeof data.yoe === "number" ? data.yoe : undefined;
  const name = (data.candidateName as string) || "Candidate";

  const getTrustLabel = (s: number) => {
    if (s >= 80) return { text: "Very High Trust", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" };
    if (s >= 65) return { text: "High Trust", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
    if (s >= 50) return { text: "Medium Trust", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" };
    return { text: "Low Trust", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  };

  const trust = getTrustLabel(score);

  const roleFitObj = profile.role_fit;
  const roleFitOneLiner =
    roleFitObj && typeof roleFitObj === "object" && "one_liner" in roleFitObj
      ? String((roleFitObj as Record<string, unknown>).one_liner ?? "").trim()
      : typeof roleFitObj === "string"
        ? String(roleFitObj).trim()
        : "";
  const roleFitDisplay = roleFitOneLiner || "Software Engineer";

  const backHref = jobId ? `/user/jd/results/${jobId}` : "/user/dashboard";

  return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center p-4 font-sans">
      <div className="bg-white dark:bg-white/[0.02] w-full max-w-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-white/[0.05] rounded-lg overflow-hidden">
        {/* HEADER */}
        <div className="p-6 border-b border-gray-100 dark:border-white/[0.05] pb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{name}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative inline-flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">ETI: {score}</span>
            </div>
            {yoe != null && (
              <span className="text-gray-600 dark:text-gray-400 text-sm">
                {yoe} year{yoe !== 1 ? "s" : ""} experience
              </span>
            )}
            <div className="relative inline-flex items-center gap-2">
              <div ref={etiTooltipRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowEtiTooltip((v) => !v)}
                  onMouseEnter={() => setShowEtiTooltip(true)}
                  onMouseLeave={() => setShowEtiTooltip(false)}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
                  aria-label="ETI scale information"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </button>
                {showEtiTooltip && (
                  <div
                    className="absolute left-0 top-full mt-2 z-50 origin-top-left"
                    role="tooltip"
                  >
                    <div className="bg-gray-900 text-white rounded-lg shadow-xl py-3 px-4 min-w-[320px] text-sm">
                      <div className="font-semibold mb-2 text-white">ETI Trust Scale</div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-amber-300">50–64</span>
                          <span className="text-gray-300">Promising but needs support</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-green-300">65–79</span>
                          <span className="text-gray-300">Strong contributor</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-teal-300">80+</span>
                          <span className="text-gray-300">Low supervision. High Leverage</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                )}
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trust.color}`}>
              {trust.text}
            </span>
          </div>
        </div>

        {/* OPERATING PROFILE */}
        <div className="p-6 pt-4">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">
            Operating Profile
          </h3>
          <div className="space-y-4">
            <ProfileRowWithReason
              label="Ramp Expectation"
              value={profile.ramp_expectation as string}
              reason={profile.ramp_reason as string}
              inverse={true}
            />
            <ProfileRowWithReason
              label="Supervision Load"
              value={profile.supervision_load as string}
              reason={profile.supervision_reason as string}
              inverse={true}
            />
            <ProfileRow label="Stack Transfer Risk" value={profile.stack_transfer_risk as string} inverse={true} />
            <ProfileRow label="Reliability Under Pressure" value={profile.reliability_under_pressure as string} />
          </div>
        </div>

        {/* ROLE FIT */}
        <div className="p-6 pt-2">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Role Fit</h3>
          <span className="inline-block bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-3 py-1 rounded text-sm font-medium border border-blue-100 dark:border-blue-800">
            {roleFitDisplay}
          </span>
        </div>

        {/* RISK FLAGS */}
        <div className="p-6 pt-2">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Risk Flags</h3>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(profile.risk_flags) && profile.risk_flags.length > 0 && profile.risk_flags[0] !== "None" ? (
              (profile.risk_flags as string[]).map((flag: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-sm font-medium">
                  {flag}
                </span>
              ))
            ) : (
              <span className="px-3 py-1 transition-colors duration-300 text-gray-500 dark:text-gray-400 rounded text-sm font-medium border border-gray-100 dark:border-white/[0.05]">
                None
              </span>
            )}
          </div>
        </div>

        {/* BACK TO RESULTS */}
        <div className="p-6 pt-4 pb-8 border-t border-gray-100 dark:border-white/[0.05]">
          <Link
            href={backHref}
            className="block w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors text-center"
          >
            Back to Results
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UserCandidateCardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen transition-colors duration-300 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Loading…</div>}>
      <UserCandidateCardContent />
    </Suspense>
  );
}

function ProfileRow({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: string;
  inverse?: boolean;
}) {
  if (!value) return null;
  const valLower = value.toLowerCase();
  let badgeColor = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (inverse) {
    if (valLower === "low") badgeColor = "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    else if (valLower === "medium") badgeColor = "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    else if (valLower === "high") badgeColor = "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  } else {
    if (valLower === "high") badgeColor = "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    else if (valLower === "medium") badgeColor = "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    else if (valLower === "low") badgeColor = "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  return (
    <div className="flex justify-between items-center border-b border-gray-50 dark:border-white/[0.05] last:border-0 pb-2 last:pb-0">
      <span className="text-gray-600 dark:text-gray-400 text-sm">{label}</span>
      <span className={`px-3 py-1 rounded-md text-sm font-medium ${badgeColor}`}>{value}</span>
    </div>
  );
}

function ProfileRowWithReason({
  label,
  value,
  reason,
  inverse = false,
}: {
  label: string;
  value: string;
  reason?: string;
  inverse?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  const valLower = value.toLowerCase();
  let badgeColor = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  if (inverse) {
    if (valLower === "low") badgeColor = "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    else if (valLower === "medium") badgeColor = "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    else if (valLower === "high") badgeColor = "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  } else {
    if (valLower === "high") badgeColor = "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    else if (valLower === "medium") badgeColor = "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
    else if (valLower === "low") badgeColor = "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  const hasReason = Boolean(reason?.trim());
  return (
    <div className="border-b border-gray-50 dark:border-white/[0.05] last:border-0 pb-2 last:pb-0">
      <div className="flex justify-between items-center">
        <span className="text-gray-600 dark:text-gray-400 text-sm">{label}</span>
        <div className="flex items-center gap-1">
          <span className={`px-3 py-1 rounded-md text-sm font-medium ${badgeColor}`}>{value}</span>
          {hasReason && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600"
              aria-expanded={expanded}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {hasReason && expanded && (
        <div className="mt-2 pl-0">
          <div className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm rounded px-3 py-2 border border-gray-200 dark:border-white/[0.1]">{reason}</div>
        </div>
      )}
    </div>
  );
}
