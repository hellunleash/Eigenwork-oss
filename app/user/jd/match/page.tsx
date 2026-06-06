"use client";

import { useState } from "react";
import { usePageTitle } from "@/lib/use-page-title";

export default function MatchPage() {
  usePageTitle("Matching");
  const [jd] = useState<Record<string, unknown> | null>(() => {
    try {
      const saved = localStorage.getItem("finalJD");
      return saved ? (JSON.parse(saved) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  });
  const loading = false;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center transition-colors duration-300">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200 dark:border-white/[0.05] p-12 shadow-sm text-center">
        <h1 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100 tracking-tight">
          Matching candidates...
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 m-0 leading-relaxed">
          {jd ? `Finding matches for: ${String(jd.title ?? "") || "your role"}` : "No job description found"}
        </p>
      </div>
    </div>
  );
}
