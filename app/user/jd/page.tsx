"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import Link from "next/link";

export default function JDInputPage() {
  usePageTitle("Create Job");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const handleSubmit = async () => {
    if (!text.trim()) return alert("Please paste a job description.");

    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/jd/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jd: text }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("parsedJD", JSON.stringify(data.data));
        window.location.href = "/user/jd/confirm";
      } else {
        alert("Could not parse the Job Description. Try again.");
      }
    } catch {
      alert("Error connecting to server.");
    }

    setLoading(false);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen transition-colors duration-300 flex items-center justify-center font-sans">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row transition-colors duration-300 font-sans">
      {/* Left Panel - Visuals & Instructions */}
      <div className="hidden md:flex flex-col justify-between w-1/3 min-w-[320px] max-w-[480px] bg-white dark:bg-[#060608] border-r border-gray-200 dark:border-white/[0.05] p-10 relative overflow-hidden">
        {/* Abstract dark mode mesh specifically for the side panel */}
        <div className="absolute inset-0 pointer-events-none opacity-50 dark:opacity-100 dark:bg-[radial-gradient(circle_at_20%_30%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.05),transparent_50%)]" />
        
        <div className="relative z-10">
          <Link
            href="/user/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Dashboard
          </Link>

          <div className="mt-16 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 border border-indigo-100 dark:border-indigo-500/20">
              <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tight mb-4 leading-tight">
              Create your evaluation pipeline
            </h1>
            <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-10">
              Paste your standard job description. Our AI will automatically extract the core competencies, technical skills, and seniority level.
            </p>

            <ul className="space-y-6">
              {[
                { title: "Paste JD", desc: "Copy and paste from your ATS or doc." },
                { title: "AI Extraction", desc: "We structure the requirements instantly." },
                { title: "Review & Publish", desc: "Tweak the criteria and start evaluating." }
              ].map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-gray-300 flex items-center justify-center text-xs font-medium border border-gray-200 dark:border-white/10">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">{step.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative z-10 text-xs text-gray-400 dark:text-gray-500 font-medium">
          Powered by EigenTrustIndex (ETI)
        </div>
      </div>

      {/* Right Panel - Input Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/[0.05] bg-white/80 dark:bg-[#0a0a0e]/80 backdrop-blur-md sticky top-0 z-30">
          <span className="font-bold text-gray-900 dark:text-white">EigenWork</span>
          <Link href="/user/dashboard" className="text-sm text-gray-500 dark:text-gray-400">Cancel</Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-20">
          <div className="w-full max-w-3xl animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            
            <div className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
              focused 
                ? "shadow-[0_0_40px_-10px_rgba(99,102,241,0.15)] border-indigo-500/50 dark:border-indigo-400/50" 
                : "shadow-sm border-gray-200 dark:border-white/[0.1] hover:border-gray-300 dark:hover:border-white/[0.15]"
              } border bg-white dark:bg-white/[0.02]`}
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-transparent flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Raw Job Description</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{text.length > 0 ? `${text.length} chars` : 'Markdown supported'}</span>
              </div>
              
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="We are looking for a Senior Frontend Engineer who has deep experience with React, Next.js, and Tailwind CSS..."
                className="w-full min-h-[400px] p-6 bg-transparent text-gray-900 dark:text-gray-100 text-base leading-relaxed outline-none resize-y placeholder:text-gray-400 dark:placeholder:text-gray-600 custom-scrollbar"
                spellCheck="false"
              />
            </div>

            <div className="mt-8 flex items-center justify-end">
              <button
                onClick={handleSubmit}
                disabled={loading || !text.trim()}
                className={`relative overflow-hidden group px-8 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
                  loading || !text.trim()
                    ? "bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "bg-gray-900 dark:bg-white text-white dark:text-black hover:scale-[1.02] hover:shadow-lg hover:shadow-gray-900/20 dark:hover:shadow-white/20 active:scale-[0.98]"
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Extracting Requirements...
                  </>
                ) : (
                  <>
                    Generate Pipeline
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </>
                )}
                
                {/* Subtle shine effect on hover */}
                {!(loading || !text.trim()) && (
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 dark:via-black/10 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.3);
          border-radius: 20px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
        }
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
