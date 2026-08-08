"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

// Sign-in modal for the acquisition surfaces. Styled to the v3 language
// (cinema-black surface, emerald accent, hairline borders, pill action) so it
// matches the current homepage regardless of the visitor's OS theme — the card
// is committed-dark rather than relying on `dark:` variants, which is what let a
// light modal render over the always-dark v3 page before.
export function HomeLoginModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Escape to close, lock body scroll, and land focus on the primary action.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => primaryRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [show, loading, onClose]);

  // Clear any stale error each time the modal is reopened.
  useEffect(() => {
    if (show) setError(null);
  }, [show]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
      router.push("/user/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      setError("Sign-in didn't complete. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={loading ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0e] p-8 sm:p-9 shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)] animate-slide-up-subtle"
      >
        {/* Emerald edge accents — tie the card to the v3 accent without a fill. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-px inset-x-10 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
        />

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="relative flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-100">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-emerald-400 text-[13px] font-bold leading-none text-emerald-950">
            E
          </span>
          EigenWork
        </div>

        <h2
          id="login-modal-title"
          className="relative mt-6 text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-zinc-50 text-balance"
        >
          Sign in to EigenWork
        </h2>
        <p className="relative mt-2 text-sm leading-relaxed text-zinc-400">
          Use your Google account to open your workspace — live in about a minute. No card, no demo call.
        </p>

        {error && (
          <div
            role="alert"
            className="relative mt-5 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
          >
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          ref={primaryRef}
          type="button"
          disabled={loading}
          onClick={handleLogin}
          className="sheen relative mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-3.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0e]"
        >
          {loading ? (
            <>
              <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
              Signing in…
            </>
          ) : (
            <>
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p className="relative mt-5 text-center text-xs leading-relaxed text-zinc-500">
          By continuing you agree to our{" "}
          <a href="/terms" className="text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
