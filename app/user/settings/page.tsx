"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";

export default function SettingsPage() {
  usePageTitle("Settings");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const toggleDark = () =>
    setDark((d) => {
      const next = !d;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("ew_theme", next ? "dark" : "light");
        } catch {
          /* ignore */
        }
      }
      return next;
    });

  if (authChecking) return <div className="min-h-screen bg-gray-50 dark:bg-gray-950" />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="border-b border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Appearance</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Dark mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Use a darker color scheme across the app.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            onClick={toggleDark}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
              dark ? "bg-gray-900 dark:bg-gray-100" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 transition-transform ${
                dark ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
