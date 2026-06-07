"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";

const ERROR_COPY: Record<string, string> = {
  invite_invalid: "This invitation is no longer valid. Ask the workspace owner to send a new one.",
  invite_expired: "This invitation has expired. Ask the workspace owner to send a new one.",
  invite_email_mismatch:
    "This invitation was sent to a different email address. Sign in with the invited email and try again.",
  token_required: "This invitation link is incomplete.",
};

function InviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const idToken = await getIdTokenOrNull();
      if (!idToken) throw new Error("not_signed_in");
      const res = await fetch("/api/org/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_COPY[data?.error] ?? "We couldn't accept this invitation. Please try again.");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/user/dashboard"), 1200);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [token, router]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0e] flex items-center justify-center px-4 transition-colors duration-300">
      <div className="bg-white dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.05] rounded-xl shadow-sm dark:shadow-none max-w-md w-full p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-1">EigenWork</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Team invitation</p>

        {!token ? (
          <p className="text-sm text-red-600 dark:text-red-400">This invitation link is incomplete or missing its token.</p>
        ) : done ? (
          <div className="text-center py-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mb-3">
              <span className="text-emerald-600 dark:text-emerald-400 text-xl">✓</span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-medium">You&apos;re in.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Taking you to the workspace…</p>
          </div>
        ) : (
          <>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-6">
              You&apos;ve been invited to join a team workspace on EigenWork. Accept to start
              reviewing candidates with your team.
            </p>

            {error && (
              <div className="mb-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {!authReady ? (
              <div className="h-11 rounded-lg bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
            ) : !user ? (
              <button
                type="button"
                disabled={busy}
                onClick={signIn}
                className="w-full flex items-center justify-center gap-3 p-3 border border-gray-200 dark:border-white/[0.1] rounded-lg hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-all disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {busy ? "Opening…" : "Sign in with Google to accept"}
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Signed in as <span className="font-medium text-gray-700 dark:text-gray-300">{user.email}</span>
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={accept}
                  className="w-full p-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {busy ? "Accepting…" : "Accept invitation"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0e]" />}>
      <InviteInner />
    </Suspense>
  );
}
