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

  if (authChecking) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Appearance</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Dark mode</p>
            <p className="text-xs text-gray-500">Coming soon — full dark theme is in progress.</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 shrink-0">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
