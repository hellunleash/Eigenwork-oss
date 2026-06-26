"use client";

// ADR-010 Phase 1 — the "Connect Slack" install trigger.
//
// Starts the OAuth flow from an AUTHENTICATED fetch (so /api/slack/install can
// resolve the caller's org and sign the state), then navigates the browser to
// Slack's authorize URL. On return, /api/slack/oauth redirects back here with
// ?slack=<status>, which we surface as a small banner.

import { useEffect, useState } from "react";
import { getIdTokenOrNull } from "@/lib/auth-client";

type Tone = "ok" | "warn" | "err";
const STATUS_COPY: Record<string, { tone: Tone; text: string }> = {
  connected: { tone: "ok", text: "Slack connected. @mention EigenBot in your workspace to try it." },
  denied: { tone: "warn", text: "Slack connection was cancelled." },
  invalid: { tone: "err", text: "That Slack link expired — please connect again." },
  error: { tone: "err", text: "Couldn't finish connecting Slack. Please try again." },
};

const toneClasses: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  err: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function ConnectSlackCard() {
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  // Real server-side connection state (independent of the post-OAuth banner), so
  // the button reflects the install on every mount — not just right after OAuth.
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("slack");
    if (s && STATUS_COPY[s]) setStatus(STATUS_COPY[s]);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getIdTokenOrNull();
        const res = await fetch("/api/slack/status", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { connected?: boolean };
        if (active && data.connected) setInstalled(true);
      } catch {
        /* leave as not-installed; the Connect button still works */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      const token = await getIdTokenOrNull();
      const res = await fetch("/api/slack/install", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status === 503) {
        setStatus({ tone: "err", text: "Slack isn't configured yet (missing SLACK_* env vars)." });
        return;
      }
      if (!res.ok) throw new Error("install_failed");
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("no_url");
      window.location.href = data.url;
    } catch {
      setStatus({ tone: "err", text: "Couldn't start the Slack connection. Please try again." });
    } finally {
      setConnecting(false);
    }
  };

  const connected = installed || status?.tone === "ok";

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 01-9 9 8.96 8.96 0 01-4.4-1.1L3 21l1.1-4.6A8.96 8.96 0 013 12a9 9 0 1118 0z" />
              </svg>
            </span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">EigenBot for Slack</h2>
          </div>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 max-w-lg">
            Ask about your candidates, compare them, and spin up intake links — right inside Slack.
            @mention the bot and it answers from your screened pipeline, no dashboard needed.
          </p>
        </div>
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          {connecting ? "Connecting…" : connected ? "Reconnect Slack" : "Connect Slack"}
        </button>
      </div>
      {status && <div className={`mt-4 text-xs rounded-lg px-3 py-2 ${toneClasses[status.tone]}`}>{status.text}</div>}
    </section>
  );
}
