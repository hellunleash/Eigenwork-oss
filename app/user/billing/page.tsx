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
const WALLET_UNIT_PRICE = 0.15;

function planLabel(plan: Me["plan"]) {
  return plan === "team" ? "Team" : plan === "single_role" ? "Single Role" : "Free";
}

export default function BillingPage() {
  usePageTitle("Billing");
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
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
    setBusy(kind);
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: Math.max(1, Math.floor(quantity)) }],
        customData: { orgId, kind },
      });
    } finally {
      setBusy(null);
    }
  };

  if (authChecking) return <div className="min-h-screen transition-colors duration-300" />;

  const plan = me?.plan ?? "free";
  const expiry =
    me?.expiresAtMs != null ? new Date(me.expiresAtMs).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;

  return (
    <div className="min-h-screen transition-colors duration-300">
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="lazyOnload" onLoad={handlePaddleLoad} />

      {/* Nav */}
      <div className="border-b border-gray-200 dark:border-white/[0.05] bg-white dark:bg-[#0a0a0e]/80 dark:backdrop-blur-md sticky top-0 z-30 transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/user/dashboard" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Billing</h1>
          </div>
          <Link href="/pricing" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            Compare plans
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Current status */}
        <div className="mb-8 bg-white border border-gray-200 rounded-xl dark:bg-white/[0.02] dark:border-white/[0.05] shadow-sm dark:shadow-none p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Current plan</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{planLabel(plan)}</p>
            {expiry && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Valid until {expiry}</p>}
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Screens left</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(me?.screensRemaining ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">Wallet</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(me?.walletBalance ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Plans */}
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Plans</h2>
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
            cta={plan === "single_role" ? "Buy another" : "Get Single Role"}
            onClick={() => checkout("single_role")}
            busy={busy === "single_role"}
          />
          <PlanCard
            name="Team"
            price="$699"
            cadence="one-time · 6 months"
            tagline="Your whole hiring team, one workspace."
            highlight
            current={plan === "team"}
            features={[
              "Up to 10 active roles",
              "15,000 candidate screens",
              "Shared workspace + invites",
              "Ashby ATS push (soon)",
              "Basic pipeline analytics",
            ]}
            cta={plan === "team" ? "Extend / buy again" : "Get Team"}
            onClick={() => checkout("team")}
            busy={busy === "team"}
          />
        </div>

        {/* Wallet top-up */}
        <div className="bg-white border border-gray-200 rounded-xl dark:bg-white/[0.02] dark:border-white/[0.05] shadow-sm dark:shadow-none p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Screen Wallet</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Pay-as-you-go overage at <span className="font-medium text-gray-900 dark:text-gray-200">${WALLET_UNIT_PRICE.toFixed(2)}/screen</span>. Used
            automatically once your plan&apos;s screens run out — never expires.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">Screens</span>
              <input
                type="number"
                min={1}
                value={walletQty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setWalletQty(Number.isInteger(v) && v >= 1 ? v : 1);
                }}
                className="block w-36 mt-1 px-3 py-2 border border-gray-300 dark:border-white/[0.1] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg"
              />
            </label>
            <button
              type="button"
              disabled={busy === "wallet_topup"}
              onClick={() => checkout("wallet_topup", walletQty)}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {busy === "wallet_topup"
                ? "Opening…"
                : `Buy ${walletQty.toLocaleString()} for $${(walletQty * WALLET_UNIT_PRICE).toFixed(2)}`}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Payments are processed securely by Paddle. Prices in USD, taxes included where applicable.
        </p>
      </div>
    </div>
  );
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
  highlight?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 flex flex-col ${
        props.highlight ? "border-gray-900 dark:border-indigo-500 bg-white dark:bg-white/[0.02] shadow-sm" : "border-gray-200 dark:border-white/[0.05] bg-white dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{props.name}</h3>
        {props.current && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
            Current
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{props.tagline}</p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">{props.price}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">{props.cadence}</p>
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onClick}
        className={`w-full py-2.5 rounded-lg text-sm font-medium mb-5 disabled:opacity-50 transition-colors ${
          props.highlight
            ? "bg-gray-900 dark:bg-indigo-600 text-white hover:bg-gray-800 dark:hover:bg-indigo-700"
            : "border border-gray-300 dark:border-white/[0.1] text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
      >
        {props.busy ? "Opening…" : props.cta}
      </button>
      <ul className="space-y-2 mt-auto">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="text-gray-400 dark:text-gray-500 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
