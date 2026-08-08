"use client";

// Shared candidate-round lifecycle hook (Phase 2). One place for the token read, the
// invite-gated GET (409 submitted / 425 not-ready / 404 invalid), and the consent-gated
// POST, so the screen / take-home / system-design pages don't each fork it. `parse` MUST
// be a module-level stable function (page-inline parse would refire the load effect).

import { useCallback, useEffect, useState } from "react";

export type RoundState<T> = {
  token: string | null;
  loading: boolean;
  error: string | null;
  notReady: boolean;
  submitted: boolean;
  submitting: boolean;
  data: T | null;
  consented: boolean;
  setConsented: (v: boolean) => void;
  website: string;
  setWebsite: (v: string) => void;
  submit: (payload: Record<string, unknown>) => Promise<void>;
};

export function useInterviewRound<T>(id: string, endpointBase: string, parse: (json: unknown) => T): RoundState<T> {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [consented, setConsented] = useState(false);
  const [website, setWebsite] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("t"));
  }, []);

  const load = useCallback(async () => {
    if (!id || !token) {
      setError("This link is invalid or has expired.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${endpointBase}/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`);
      if (res.status === 409) {
        setSubmitted(true);
        return;
      }
      if (res.status === 425) {
        setNotReady(true);
        return;
      }
      if (!res.ok) {
        setError(res.status === 404 ? "This link is invalid or has expired." : "Something went wrong loading this page.");
        return;
      }
      setData(parse(await res.json()));
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, token, endpointBase, parse]);

  useEffect(() => {
    if (token !== null) void load();
  }, [token, load]);

  const submit = useCallback(
    async (payload: Record<string, unknown>) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`${endpointBase}/${encodeURIComponent(id)}?t=${encodeURIComponent(token ?? "")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website, consent: consented, ...payload }),
        });
        if (!res.ok) {
          setError("Couldn't submit. Please try again.");
          return;
        }
        setSubmitted(true);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [id, token, endpointBase, website, consented]
  );

  return { token, loading, error, notReady, submitted, submitting, data, consented, setConsented, website, setWebsite, submit };
}
