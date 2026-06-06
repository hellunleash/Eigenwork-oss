"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";

export default function JDInputPage() {
  usePageTitle("Create Job");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({jd: text }),
      });

      const data = await res.json();

      // Store the parsed fields in localStorage for Step 2 page
      if (data.success) {
        localStorage.setItem("parsedJD", JSON.stringify(data.data));

        // Redirect to the structured confirmation page
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center font-sans">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Checking authentication…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4 flex items-center justify-between">
        <a
          href="/user/dashboard"
          className="font-bold text-xl text-gray-900 dark:text-gray-100 no-underline tracking-tight"
        >
          EigenWork
        </a>
        <a href="/user/dashboard" className="text-sm text-gray-500 dark:text-gray-400 no-underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Dashboard
        </a>
      </nav>
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 shadow-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100 tracking-tight leading-snug">
              Job Description
            </h1>
            <p className="text-sm text-gray-900 dark:text-gray-300 m-0 leading-relaxed">
              Paste your Tech Role Description. We&apos;ll extract and structure the key information automatically.
            </p>
          </div>

          <div className="mb-6">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste job description here..."
              className="w-full min-h-[280px] p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none resize-y leading-relaxed transition-colors duration-150 focus:border-blue-500 dark:focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full py-3 px-6 rounded-lg text-sm font-medium transition-colors duration-150 ${
              loading
                ? "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed"
                : "bg-gray-900 dark:bg-indigo-600 text-white hover:bg-gray-700 dark:hover:bg-indigo-700 cursor-pointer"
            }`}
          >
            {loading ? "Processing..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
