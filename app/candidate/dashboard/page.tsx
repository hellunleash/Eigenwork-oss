"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/lib/use-page-title";

function CandidateDashboardContent() {
  usePageTitle("Your Results");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let id = searchParams.get("id");
    let token = searchParams.get("t");
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("eti_result");
        if (stored) {
          const parsed = JSON.parse(stored) ?? {};
          if (!id) id = parsed.id ?? null;
          if (!token) token = parsed.accessToken ?? null;
        }
      } catch { /* ignore */ }
    }
    if (!id) {
      router.replace("/candidate");
      return;
    }
    let cancelled = false;
    const qs = token ? `?t=${encodeURIComponent(token)}` : "";
    fetch(`/api/candidate/${encodeURIComponent(id)}${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
        return res.json();
      })
      .then((doc) => {
        if (!cancelled) setData(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [searchParams, router]);

  if (loading || !data) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-400 text-sm">
      {error ? (
        <>
          <p className="mb-2">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm"
          >
            Exit
          </button>
        </>
      ) : (
        <div className="animate-pulse mb-2">Loading Profile...</div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <p className="text-gray-900 text-lg font-medium mb-6">Your application has been submitted.</p>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="w-full max-w-xs py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
      >
        Exit
      </button>
    </div>
  );
}

export default function CandidateCardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">Loading…</div>}>
      <CandidateDashboardContent />
    </Suspense>
  );
}