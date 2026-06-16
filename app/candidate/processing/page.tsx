'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from "@/lib/use-page-title";

export default function ProcessingPage() {
  usePageTitle("Processing");
  const router = useRouter();
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Prevent double run in React strict mode
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function processApplication() {
      // 1. Get stored form data
      const storedData = sessionStorage.getItem('candidateFormData');
      if (!storedData) {
        router.push('/candidate');
        return;
      }

      const candidateData = JSON.parse(storedData) as {
        jobId?: string;
        resumeBase64?: string;
        githubUrl?: string;
        source?: string; // ADR-009 §7 channel attribution; forwarded as-is below
        [key: string]: unknown;
      };
      if (candidateData?.jobId) setJobId(candidateData.jobId);

      // ⭐⭐⭐ IMPORTANT FIX ⭐⭐⭐
      // Convert data URL → raw base64 (Vision requires RAW base64)
      if (
        candidateData.resumeBase64 &&
        candidateData.resumeBase64.startsWith("data:")
      ) {
        candidateData.resumeBase64 = candidateData.resumeBase64.split(",")[1];
      }
      // ⭐⭐⭐ END FIX ⭐⭐⭐

      try {
        // Dynamic UX message
        if (candidateData.githubUrl?.trim()) {
          setStatus("Extracting GitHub DNA & analyzing code structure...");
        } else {
          setStatus("Analyzing resume artifacts...");
        }

        // 3. Call backend (turnstileToken is already in candidateData from the form).
        const response = await fetch('/api/candidate/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidateData),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          // Only surface server-provided human strings (errBody.message). Raw
          // error codes (errBody.error like "no_screens" / "rate_limited") are
          // machine identifiers, not user-facing — fall back to a generic
          // message rather than leaking them to candidates.
          const friendly =
            typeof errBody?.message === "string" && errBody.message.trim()
              ? errBody.message
              : "We couldn't process your application right now. Please try again in a moment.";
          throw new Error(friendly);
        }

        const result = await response.json();

        // Save & cleanup
        sessionStorage.removeItem('candidateFormData');
        localStorage.setItem('eti_result', JSON.stringify(result));

        setStatus("Finalizing EigenTrust Score...");

        // Use the server-built redirect URL so the per-candidate access token
        // (?t=...) is included. The dashboard needs the token to read its own
        // status without exposing the doc to ID-guessing attackers.
        const fallbackRedirect = `/candidate/dashboard?id=${encodeURIComponent(result.id)}${
          result.accessToken ? `&t=${encodeURIComponent(result.accessToken)}` : ""
        }`;
        const redirectTo = typeof result.redirect === "string" ? result.redirect : fallbackRedirect;
        setTimeout(() => {
          router.push(redirectTo);
        }, 900);

      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : "Failed to process your application. Please try again.";
        setError(message);
        setStatus("Process Failed");
      }
    }

    processApplication();
  }, [router]);

  // Error UI
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0e] p-4 transition-colors duration-300">
        <div className="text-center max-w-md">
          <div className="text-red-500 dark:text-red-400 text-5xl mb-4">✕</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Analysis Failed</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => router.push(jobId ? `/candidate?jobId=${encodeURIComponent(jobId)}` : '/candidate')}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Loading UI
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0a0a0e] p-4 transition-colors duration-300">
      <div className="flex flex-col items-center space-y-6 max-w-md w-full">

        <div className="relative w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-200 dark:border-white/[0.1] rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-900 dark:border-gray-100 rounded-full animate-spin border-t-transparent"></div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            EigenTrust AI
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">{status}</p>
        </div>

        <div className="w-64 h-1 bg-gray-200 dark:bg-white/[0.1] rounded-full overflow-hidden">
          <div className="h-full bg-gray-900 dark:bg-gray-100 animate-progress origin-left"></div>
        </div>

      </div>

      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 90%; }
        }
        .animate-progress {
          animation: progress 8s ease-out forwards;
        }
      `}</style>
    </div>
  );
}