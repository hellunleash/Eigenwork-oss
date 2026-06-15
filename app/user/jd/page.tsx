"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { PreviewSidebar } from "../PreviewSidebar";

export default function JDInputPage() {
  usePageTitle("Create Job");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
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

  if (authChecking) return <div className="min-h-screen bg-white dark:bg-[#0a0a0a]" />;

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="pipelines" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-5">
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <a href="/user/pipelines" className="hover:text-gray-900 dark:hover:text-gray-200">Role pipelines</a>
            <ChevronTiny />
            <span className="text-gray-700 dark:text-gray-200 font-medium">New role</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Create a role</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Paste a job description — we extract the core competencies, skills, and seniority automatically.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Composer */}
          <div className="lg:col-span-2">
            <div
              className={`rounded-2xl border bg-white dark:bg-white/[0.02] overflow-hidden transition-colors ${
                focused ? "border-sky-500/50 ring-2 ring-sky-500/20" : "border-gray-200/80 dark:border-white/[0.06]"
              }`}
            >
              <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Raw job description</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{text.length > 0 ? `${text.length.toLocaleString()} chars` : "Markdown supported"}</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="We are looking for a Senior Frontend Engineer with deep experience in React, Next.js, and Tailwind CSS…"
                className="w-full min-h-[360px] p-5 bg-transparent text-gray-900 dark:text-gray-100 text-sm leading-relaxed outline-none resize-y placeholder:text-gray-400 dark:placeholder:text-gray-600"
                spellCheck="false"
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">You can fine-tune everything on the next step before publishing.</p>
              <button
                onClick={handleSubmit}
                disabled={loading || !text.trim()}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  loading || !text.trim()
                    ? "bg-gray-100 dark:bg-white/[0.05] text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Extracting requirements…
                  </>
                ) : (
                  <>
                    Generate pipeline
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-gray-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 lg:p-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">How it works</h2>
              <ol className="mt-4 space-y-4">
                {[
                  { title: "Paste the JD", desc: "Copy from your ATS or a doc." },
                  { title: "AI extraction", desc: "We structure the requirements instantly." },
                  { title: "Review & publish", desc: "Tweak the criteria and start evaluating." },
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-xs font-semibold flex items-center justify-center tabular-nums">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 pt-4 border-t border-gray-100 dark:border-white/[0.05] text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                Powered by EigenTrustIndex (ETI)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}
