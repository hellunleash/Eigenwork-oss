"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePageTitle } from "@/lib/use-page-title";

/** Redirects to the shared results page with jobId in query. */
export default function UserJDResultsPage() {
  usePageTitle("Top Candidates");
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  useEffect(() => {
    if (jobId) {
      router.replace(`/user/jd/results?jobId=${encodeURIComponent(jobId)}`);
    }
  }, [jobId, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Loading…</p>
    </div>
  );
}
