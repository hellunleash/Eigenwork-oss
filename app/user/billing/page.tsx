"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import useSWR from "swr";
import { usePageTitle } from "@/lib/use-page-title";
import { WALLET_UNIT_PRICE, WALLET_MIN_QTY, WALLET_MAX_QTY } from "@/lib/wallet-config";
import { BILLING_EMAIL } from "@/lib/contact";
import { PreviewSidebar } from "../PreviewSidebar";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string }) => void;
      Checkout: {
        open: (opts: {
          items: Array<{ priceId: string; quantity: number }>;
          customData?: Record<string, string>;
        }) => void;
      };
    };
  }
}

type Me = {
  orgId: string | null;
  plan: "free" | "single_role" | "team" | null;
  screensRemaining: number;
  screensUsed: number;
  screenCap: number;
  walletBalance: number;
  expiresAtMs: number | null;
};

type Kind = "single_role" | "team" | "wallet_topup";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function planLabel(plan: Me["plan"]) {
  return plan === "team" ? "Team" : plan === "single_role" ? "Single Role" : "Free";
}

export default function BillingPage() {
  usePageTitle("Billing");
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [walletQty, setWalletQty] = useState(1000);
  const [busy, setBusy] = useState<Kind | null>(null);
  const paddleInit = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return router.replace("/");
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const { data: me } = useSWR<Me>(
    authChecking ? null : "/api/user/me",
    async (url: string) => {
      const t = await getIdTokenOrNull();
      const r = await fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : undefined });
      if (!r.ok) throw new Error("fetch_failed");
      return r.json();
    },
    { dedupingInterval: 5000 }
  );
  const { data: cfg } = useSWR(
    authChecking ? null : "/api/paddle/config",
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 60000 }
  );
  const prices: Record<string, string | null> = cfg?.prices ?? {};

  const handlePaddleLoad = useCallback(() => {
    if (typeof window === "undefined" || !window.Paddle || paddleInit.current) return;
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return;
    paddleInit.current = true;
    window.Paddle.Environment.set("production");
    window.Paddle.Initialize({ token });
  }, []);

  const checkout = async (kind: Kind, quantity = 1) => {
    if (!window.Paddle?.Checkout) return alert("Checkout is still loading — try again in a moment.");
    const orgId = me?.orgId;
    if (!orgId) return alert("Workspace isn't ready yet — refresh and try again.");
    const priceId = prices[kind];
    if (!priceId) return alert("This product isn't available yet. (Price not configured.)");
    // Defensive clamp: the UI input also enforces bounds, but a stale render
    // or programmatic state could leak an out-of-range value. The webhook
    // re-validates as the final guard before crediting.
    let qty = Math.max(1, Math.floor(quantity));
    if (kind === "wallet_topup") {
      qty = Math.min(WALLET_MAX_QTY, Math.max(WALLET_MIN_QTY, qty));
    }
    setBusy(kind);
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: qty }],
        customData: { orgId, kind },
      });
    } finally {
      setBusy(null);
    }
  };

  if (authChecking) return <div className="min-h-screen bg-white dark:bg-[#0a0a0a]" />;

  const plan = me?.plan ?? "free";

  // There's no extension/stacking in the backend: grantPass replaces the active
  // pass, so buying your current tier again (or a lower tier) just forfeits the
  // screens you have left — no refund, no carry-over. So the plan you're on, and
  // anything below it, is shown as non-purchasing rather than a money-wasting CTA.
  const singleState =
    plan === "team"
      ? { cta: "Included in Team", disabled: true, current: false }
      : plan === "single_role"
      ? { cta: "Current plan", disabled: true, current: true }
      : { cta: "Get Single Role", disabled: false, current: false };
  const teamState =
    plan === "team"
      ? { cta: "Current plan", disabled: true, current: true }
      : { cta: "Get Team", disabled: false, current: false };

  const expiry =
    me?.expiresAtMs != null ? new Date(me.expiresAtMs).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;
  const screenCap = me?.screenCap ?? 0;
  const screensUsed = me?.screensUsed ?? 0;
  const usedPct = screenCap > 0 ? Math.min(100, Math.round((screensUsed / screenCap) * 100)) : 0;

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="lazyOnload" onLoad={handlePaddleLoad} />
      <PreviewSidebar active="billing" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <a href="/user/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">Dashboard</a>
                <ChevronTiny />
                <span className="text-gray-700 dark:text-gray-200 font-medium">Billing</span>
              </nav>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Billing</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Plans, screen usage, and prepaid wallet top-ups.</p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.04]"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8">
        {/* Current status */}
        <div className="mb-8 bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6 flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Current plan</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{planLabel(plan)}</p>
            {expiry && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Valid until {expiry}</p>}
          </div>
          <div className="flex items-center gap-8">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Screens left</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{(me?.screensRemaining ?? 0).toLocaleString()}</p>
              {screenCap > 0 && (
                <div className="mt-2 w-36 h-1.5 bg-gray-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usedPct}%` }} />
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Wallet</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{(me?.walletBalance ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Plans */}
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 tracking-tight">Plans</h2>
        <div className="grid md:grid-cols-2 gap-5 mb-10">
          <PlanCard
            name="Single Role"
            price="$149"
            cadence="one-time"
            tagline="Fill one role, no subscription."
            features={[
              "1 active role",
              "Up to 1,500 candidate screens",
              "ETI scoring + ranking",
              "Candidate reports + CSV export",
              "Valid 60 days",
            ]}
            current={singleState.current}
            cta={singleState.cta}
            disabled={singleState.disabled}
            onClick={() => checkout("single_role")}
            busy={busy === "single_role"}
          />
          <PlanCard
            name="Team"
            price="$699"
            cadence="one-time · 6 months"
            tagline="Your whole hiring team, one workspace."
            highlight
            current={teamState.current}
            features={[
              "Up to 10 active roles",
              "15,000 candidate screens",
              "Shared workspace + invites",
              "Ashby ATS push (soon)",
              "Basic pipeline analytics",
            ]}
            cta={teamState.cta}
            disabled={teamState.disabled}
            onClick={() => checkout("team")}
            busy={busy === "team"}
          />
        </div>

        {/* Wallet top-up */}
        <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-5 lg:p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 tracking-tight">Screen Wallet</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Prepaid overage at <span className="font-medium text-gray-900 dark:text-gray-200">${WALLET_UNIT_PRICE.toFixed(2)}/screen</span>. Top up any
            amount; drawn from once your plan&apos;s screens run out — never expires.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">Screens</span>
              <input
                type="number"
                min={WALLET_MIN_QTY}
                max={WALLET_MAX_QTY}
                value={walletQty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  // While typing, only enforce the upper bound and reject
                  // junk/negative values. The lower bound is checked at
                  // submit time so the user can type freely (e.g. "1500"
                  // without "1" snapping to the minimum mid-keystroke).
                  if (!Number.isInteger(v) || v < 1) {
                    setWalletQty(1);
                    return;
                  }
                  setWalletQty(Math.min(WALLET_MAX_QTY, v));
                }}
                className="block w-36 mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40"
              />
            </label>
            <button
              type="button"
              disabled={busy === "wallet_topup" || walletQty < WALLET_MIN_QTY}
              onClick={() => checkout("wallet_topup", walletQty)}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === "wallet_topup"
                ? "Opening…"
                : `Buy ${walletQty.toLocaleString()} for ${usd(walletQty * WALLET_UNIT_PRICE)}`}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Min {WALLET_MIN_QTY.toLocaleString()} · Max {WALLET_MAX_QTY.toLocaleString()} screens per top-up.
            {" "}Need more?{" "}
            <a
              href={`mailto:${BILLING_EMAIL}`}
              className="font-medium text-gray-700 dark:text-gray-300 underline hover:text-gray-900 dark:hover:text-gray-100"
            >
              Email us
            </a>
            .
          </p>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Payments are processed securely by Paddle. Prices in USD, taxes included where applicable.
        </p>
      </div>
    </div>
  );
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

function PlanCard(props: {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 flex flex-col bg-white dark:bg-white/[0.02] ${
        props.highlight ? "border-gray-900 dark:border-emerald-500/40 shadow-sm" : "border-gray-200/80 dark:border-white/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{props.name}</h3>
        {props.current && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
            Current
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{props.tagline}</p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-4xl font-semibold text-gray-900 dark:text-gray-100">{props.price}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{props.cadence}</p>
      <button
        type="button"
        disabled={props.busy || props.disabled}
        onClick={props.onClick}
        className={`w-full py-2.5 rounded-lg text-sm font-medium mb-5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          props.highlight
            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
            : "border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
        }`}
      >
        {props.busy ? "Opening…" : props.cta}
      </button>
      <ul className="space-y-2 mt-auto">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="text-emerald-500 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
