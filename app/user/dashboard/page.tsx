"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { mutate as swrMutate } from "swr";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { usePageTitle } from "@/lib/use-page-title";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { UserSidebar } from "./UserSidebar";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string }) => void;
      Checkout: {
        open: (opts: {
          items: Array<{ priceId: string; quantity: number }>;
          customData?: Record<string, string>;
        }) => void;
      };
    };
  }
}

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
  const [creditsModal, setCreditsModal] = useState(false);
  const [creditsQuantity, setCreditsQuantity] = useState(10);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [generateModal, setGenerateModal] = useState<Pipeline | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  // Elapsed seconds since the match request started, surfaced in the modal so
  // the user has visible proof the request is still in flight. Match takes
  // ~10s for small pools and up to ~50s for ~5k applicants.
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [deleteModal, setDeleteModal] = useState<Pipeline | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [paddleReady, setPaddleReady] = useState(false);
  const paddleInitRef = useRef(false);
  const [orgs, setOrgs] = useState<
    Array<{ orgId: string; name: string; plan: string | null; role: string | null; isActive: boolean }>
  >([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Use the SWR-based dashboard data hook
  const { pipelines, entitlement, isLoading, error, revalidate, mutatePipelines } = useDashboardData(userId);
  const screensRemaining = entitlement?.screensRemaining ?? 0;
  const planLabel =
    entitlement?.plan === "team" ? "Team" : entitlement?.plan === "single_role" ? "Single Role" : "Free";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
      setUserId(user.uid);
      setUserName(user.displayName);
      setUserEmail(user.email);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const token = await getIdTokenOrNull();
        const res = await fetch("/api/org/list", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data.orgs)) setOrgs(data.orgs);
      } catch {
        /* non-fatal: the switcher just won't render */
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleSwitchOrg = async (orgId: string) => {
    try {
      const token = await getIdTokenOrNull();
      await fetch("/api/org/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      });
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  const handlePaddleLoad = useCallback(() => {
    if (typeof window === "undefined" || !window.Paddle || paddleInitRef.current) return;
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) {
      console.error("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set");
      return;
    }
    paddleInitRef.current = true;
    window.Paddle.Environment.set("production");
    window.Paddle.Initialize({ token });
    setPaddleReady(true);
  }, []);

  const handleCheckout = async (
    kind: "single_role" | "team" | "wallet_topup",
    quantity = 1
  ) => {
    if (!window.Paddle?.Checkout) {
      alert("Checkout is loading. Please try again in a moment.");
      return;
    }
    const orgId = entitlement?.orgId;
    if (!orgId) {
      alert("Workspace isn't ready yet — refresh and try again.");
      return;
    }
    setCreditsLoading(true);
    try {
      const res = await fetch("/api/paddle/config");
      if (!res.ok) throw new Error("Failed to load checkout config");
      const cfg = (await res.json()) as { prices?: Record<string, string | null> };
      const priceId = cfg.prices?.[kind];
      if (!priceId) throw new Error("This product isn't available yet.");
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: Math.max(1, Math.floor(quantity)) }],
        customData: { orgId, kind },
      });
      setCreditsModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCreditsLoading(false);
    }
  };

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
    // Tick the elapsed counter once per second while the request is in flight.
    // Cleared in the finally{} after the request settles.
    const tickStart = Date.now();
    const ticker = setInterval(() => {
      setGenerateElapsed(Math.floor((Date.now() - tickStart) / 1000));
    }, 1000);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Prefer Cloud Run when NEXT_PUBLIC_CLOUD_RUN_URL is set — bypasses the
      // Vercel 60s cap so 10k-candidate pools complete reliably. Falls back to
      // the in-Vercel /api/jd/match route when unset (instant rollback path).
      // See docs/adr/001-vercel-cloud-run-hybrid.md.
      const cloudRunBase = process.env.NEXT_PUBLIC_CLOUD_RUN_URL?.replace(/\/+$/, "") ?? "";
      const res = cloudRunBase
        ? await fetch(`${cloudRunBase}/match`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ jobId: generateModal.id }),
          })
        : await fetch(`/api/jd/match?jobId=${encodeURIComponent(generateModal.id)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
      if (!res.ok) throw new Error("Request failed");
      const closeRes = await fetch("/api/jd/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jobId: generateModal.id }),
      });
      if (!closeRes.ok) throw new Error("Failed to close pipeline");
      setGenerateModal(null);
      // Revalidate dashboard data after generating candidates
      await revalidate();
      // Invalidate results cache for this jobId so results page shows fresh data
      await swrMutate(`/api/jd/match?jobId=${encodeURIComponent(generateModal.id)}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      clearInterval(ticker);
      setGenerateLoading(false);
      setGenerateElapsed(0);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (e) {
      console.error(e);
      router.push("/");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      // Prefer Cloud Run for cascade delete (no 60s cap, handles pipelines
      // with thousands of candidates). Falls back to in-Vercel DELETE route
      // (which is now parallelized in-place; OK for typical pool sizes).
      const cloudRunBase = process.env.NEXT_PUBLIC_CLOUD_RUN_URL?.replace(/\/+$/, "") ?? "";
      const res = cloudRunBase
        ? await fetch(`${cloudRunBase}/jd/cascade-delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ jobId: deleteModal.id }),
          })
        : await fetch(`/api/jd/${encodeURIComponent(deleteModal.id)}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteModal(null);
      // Optimistically update cache, then revalidate
      await mutatePipelines(
        (current: { pipelines: Pipeline[] } | Pipeline[] | undefined) => {
          const currentPipelines = Array.isArray(current) 
            ? current 
            : (current && 'pipelines' in current ? current.pipelines : []);
          const filtered = currentPipelines.filter((p: Pipeline) => p.id !== deleteModal.id);
          // Return in the same format as the API response
          return { pipelines: filtered };
        },
        { revalidate: true }
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
      // Revalidate on error to ensure cache is correct
      await revalidate();
    } finally {
      setDeleteLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-500 text-sm">Checking authentication…</p>
      </div>
    );
  }

  // Only show loading if we truly have no data (first load)
  // Never show loading during revalidation - always preserve cached data
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-500 text-sm">Loading pipelines…</p>
      </div>
    );
  }

  // Only show error if we have no cached data to display
  if (error && pipelines.length === 0 && screensRemaining === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => revalidate()}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pl-60">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="lazyOnload"
        onLoad={handlePaddleLoad}
      />
      <UserSidebar
        planLabel={planLabel}
        screensRemaining={screensRemaining}
        plan={entitlement?.plan ?? null}
        orgs={orgs}
        activeOrgId={entitlement?.orgId ?? null}
        onSwitchOrg={handleSwitchOrg}
        onBuy={() => setCreditsModal(true)}
        onLogout={handleLogout}
        userName={userName}
        userEmail={userEmail}
      />
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        </div>
      </div>

      {/* No-screens warning banner */}
      {screensRemaining === 0 && pipelines.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-3xl mx-auto px-4 py-3 sm:px-6">
            <div className="flex items-start gap-3">
              <span className="text-amber-600 text-lg shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-900">
                  Your intake links are paused
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Add screens to resume accepting candidate applications. Your intake links remain valid and will automatically reactivate when you add screens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreditsModal(true)}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors shrink-0"
              >
                Add Screens
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Your Evaluation Pipelines
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage your role pipelines. Share the intake link to collect and auto-evaluate candidate submissions.
          </p>
        </header>

        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/user/jd")}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Create New Pipeline
          </button>
        </div>

        {pipelines.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
            <p className="text-gray-600 text-sm mb-4">No pipelines created yet.</p>
            <button
              type="button"
              onClick={() => router.push("/user/jd")}
              className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Start a New Pipeline
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {pipelines.map((p) => {
              const ratio = submissionRatio(p);
              const cap = p.submissionCap;
              const matchingCompleted = p.isClosed || p.hasMatchResult === true;
              const isWaiting = ratio < 0.6 && !matchingCompleted;
              const canGenerate = ratio >= 0.6 && !matchingCompleted;
              const isClosed = matchingCompleted;

              const statusLabel =
                p.appliedCount === 0
                  ? "0 submissions yet"
                  : `${p.appliedCount} candidate${p.appliedCount === 1 ? "" : "s"} evaluated`;

              return (
                <li
                  key={p.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900 font-medium truncate">{p.title || "Untitled role"}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {statusLabel} {cap > 0 ? `(Applicant limit ${cap})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {isWaiting && (
                      <button
                        type="button"
                        disabled
                        title="This becomes available after 60% of the applicant limit is reached."
                        className="px-3 py-1.5 text-gray-500 bg-gray-100 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
                      >
                        Waiting for submissions
                      </button>
                    )}
                    {canGenerate && (
                      <button
                        type="button"
                        onClick={() => setGenerateModal(p)}
                        className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                      >
                        Generate Top Candidates
                      </button>
                    )}
                    {isClosed && (
                      <button
                        type="button"
                        onClick={() => router.push(`/user/jd/results/${p.id}`)}
                        className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                      >
                        View Top Candidates
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => router.push(`/user/jd/confirm?jobId=${encodeURIComponent(p.id)}`)}
                      className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                    >
                      Edit role settings
                    </button>
                    <button
                      type="button"
                      disabled={screensRemaining <= 0}
                      title={screensRemaining <= 0 ? "Add screens to copy intake link" : undefined}
                      onClick={() => screensRemaining > 0 && handleCopyIntakeLink(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        screensRemaining <= 0
                          ? "text-gray-500 bg-gray-100 opacity-50 cursor-not-allowed"
                          : "text-gray-700 bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Copy Intake Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteModal(p)}
                      className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Generate modal */}
      {generateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !generateLoading && setGenerateModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {generateLoading ? "Generating top candidates…" : "Generate top candidates now?"}
            </h3>

            {generateLoading ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Ranking your applicant pool. This usually takes 10–30 seconds and can run up to a minute for larger pools. Please don&apos;t close this window.
                </p>
                {/* Indeterminate progress bar.
                    The animated stripe is driven by the inline keyframes
                    below — kept inline so the modal is self-contained and
                    we don't need to touch globals.css for a single
                    component. */}
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gray-900 rounded-full"
                    style={{
                      width: "40%",
                      animation: "eigen-progress-slide 1.4s ease-in-out infinite",
                    }}
                  />
                </div>
                <style>{`
                  @keyframes eigen-progress-slide {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(350%); }
                  }
                `}</style>
                <p className="text-xs text-gray-500 mb-6 tabular-nums">
                  Elapsed: {generateElapsed}s
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600 mb-6">
                This will freeze new submissions for this role. Continue and generate the top candidate list?
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={generateLoading}
                onClick={() => setGenerateModal(null)}
                className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Cancel / Wait
              </button>
              <button
                type="button"
                disabled={generateLoading}
                onClick={handleGenerateContinue}
                className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {generateLoading ? "Generating…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy EigenCredits modal */}
      {creditsModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !creditsLoading && setCreditsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Buy or upgrade</h3>
            <p className="text-sm text-gray-600 mb-4">
              One-time purchases. A new plan replaces your current one; Screen Wallet top-ups stack on top and are used after your plan&apos;s screens run out.
            </p>

            <div className="space-y-3">
              {/* Single Role */}
              <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">Single Role — $149</p>
                  <p className="text-xs text-gray-500">1 role · 1,500 screens · 60 days</p>
                </div>
                <button
                  type="button"
                  disabled={creditsLoading}
                  onClick={() => handleCheckout("single_role")}
                  className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 shrink-0"
                >
                  Buy
                </button>
              </div>

              {/* Team */}
              <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">Team — $699</p>
                  <p className="text-xs text-gray-500">10 roles · 15,000 screens · 6 months · ATS</p>
                </div>
                <button
                  type="button"
                  disabled={creditsLoading}
                  onClick={() => handleCheckout("team")}
                  className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 shrink-0"
                >
                  Buy
                </button>
              </div>

              {/* Screen Wallet top-up */}
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-900">Screen Wallet — $0.15/screen</p>
                <p className="text-xs text-gray-500 mb-2">Top up overage screens; used after your plan bucket runs out.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={creditsQuantity}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setCreditsQuantity(Number.isInteger(v) && v >= 1 ? v : 1);
                    }}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                  <button
                    type="button"
                    disabled={creditsLoading}
                    onClick={() => handleCheckout("wallet_topup", creditsQuantity)}
                    className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {creditsLoading ? "…" : `Top up ${creditsQuantity}`}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                disabled={creditsLoading}
                onClick={() => setCreditsModal(false)}
                className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleteLoading && setDeleteModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete this pipeline?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete the pipeline, all candidate submissions for this role, and their resume files. The intake link will be disabled. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteModal(null)}
                className="px-3 py-1.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
