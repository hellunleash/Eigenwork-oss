"use client";

import { useState } from "react";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { TurnstileWidget } from "../../components/TurnstileWidget";

/**
 * Shown when a freshly-provisioned org has no active pass. Claims the Free
 * pass (100 screens) after a device-fingerprint + Cloudflare Turnstile check.
 * Degrades gracefully: if NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, the widget
 * renders nothing and it runs fingerprint-only.
 */
export function FreeClaimGate({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const [fingerprint, token] = await Promise.all([getDeviceFingerprint(), getIdTokenOrNull()]);
      const res = await fetch("/api/free/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ turnstileToken, fingerprint }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) return onClaimed();
      setError(
        data.reason === "device_already_claimed"
          ? "This device has already used a free trial. Buy a plan to keep screening candidates."
          : data.reason === "captcha_failed"
          ? "Verification failed — please try again."
          : "Couldn't claim your free screens. Please try again."
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-300 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] rounded-xl shadow-sm max-w-md w-full p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Start free</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Get <span className="font-semibold text-gray-900 dark:text-gray-100">100 free candidate screens</span> on one role. Verify
          you&apos;re human to begin.
        </p>
        {error && (
          <div className="mb-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-left">
            {error}
          </div>
        )}
        <div className="flex justify-center mb-4">
          <TurnstileWidget onToken={setTurnstileToken} />
        </div>
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="w-full py-3 bg-gray-900 dark:bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Claim 100 free screens"}
        </button>
      </div>
    </div>
  );
}
