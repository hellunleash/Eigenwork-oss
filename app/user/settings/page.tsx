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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleDarkMode = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  if (authChecking) return <div className="min-h-screen transition-colors duration-300" />;

  return (
    <div className="min-h-screen transition-colors duration-300">
      <div className="border-b border-gray-200 dark:border-white/[0.05] bg-white dark:bg-[#0a0a0e]/80 dark:backdrop-blur-md sticky top-0 z-30 transition-colors duration-300">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Appearance</h2>
        <div className="bg-white border border-gray-200 rounded-xl dark:bg-white/[0.02] dark:border-white/[0.05] shadow-sm dark:shadow-none p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Dark mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Toggle between light and dark theme.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={toggleDarkMode}
            className={`${
              isDark ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700"
            } relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900`}
          >
            <span
              aria-hidden="true"
              className={`${
                isDark ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
