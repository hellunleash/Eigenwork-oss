"use client";

import Script from "next/script";
import { useState } from "react";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { getDeviceFingerprint } from "@/lib/fingerprint";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (key: string, opts: { action: string }) => Promise<string>;
    };
  }
}

/**
 * Shown when a freshly-provisioned org has no active pass. Claims the Free
 * pass (100 screens) after a device-fingerprint + reCAPTCHA check. Degrades
 * gracefully: if NEXT_PUBLIC_RECAPTCHA_SITE_KEY is unset, it runs
 * fingerprint-only.
 */
export function FreeClaimGate({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecaptchaToken = (): Promise<string> =>
    new Promise((resolve) => {
      if (!SITE_KEY || !window.grecaptcha) return resolve("");
      window.grecaptcha.ready(() => {
        window.grecaptcha!.execute(SITE_KEY, { action: "claim_free" }).then(resolve).catch(() => resolve(""));
      });
    });

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const [fingerprint, recaptchaToken, token] = await Promise.all([
        getDeviceFingerprint(),
        getRecaptchaToken(),
        getIdTokenOrNull(),
      ]);
      const res = await fetch("/api/free/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ recaptchaToken, fingerprint }),
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      {SITE_KEY && (
        <Script src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`} strategy="lazyOnload" />
      )}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm max-w-md w-full p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Start free</h1>
        <p className="text-sm text-gray-600 mb-6">
          Get <span className="font-semibold text-gray-900">100 free candidate screens</span> on one role. Verify
          you&apos;re human to begin.
        </p>
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-left">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="w-full py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Claim 100 free screens"}
        </button>
        {SITE_KEY && <p className="text-[11px] text-gray-400 mt-4">Protected by reCAPTCHA.</p>}
      </div>
    </div>
  );
}
