#!/usr/bin/env -S npx tsx
// scripts/verify-paddle-credit.ts
//
// Verifies the Paddle credit path END TO END without any Paddle account,
// sandbox token, tunnel, or app-code change. It signs realistic
// `transaction.completed` payloads with the SAME PADDLE_WEBHOOK_SECRET your
// dev server reads from .env.local, POSTs them to the REAL /api/paddle/webhook
// route, and then reads getEntitlementSummary(orgId) to assert the screens/plan
// ACTUALLY landed in Firestore — because a 200 from the webhook does NOT prove
// the customer was credited.
//
// It exercises the failure modes that matter for "did my new pricing break the
// money path":
//   1. wallet_topup           -> walletBalance increases by quantity
//   2. duplicate delivery     -> same txn id is deduped, NOT credited twice
//      (Paddle retries on any non-2xx/timeout; double-credit is a real bug)
//   3. out-of-range quantity  -> refused (no credit), per WALLET_MIN/MAX guard
//   4. single_role grant      -> plan flips to single_role
//   5. team grant             -> plan flips to team
//   6. bad signature          -> 401 (and no credit)
//
// PREREQ: the dev server must be running so the real route is live:
//   npm run dev          (in another terminal; defaults to http://localhost:3000)
//
// Usage:
//   npx tsx scripts/verify-paddle-credit.ts
//   npx tsx scripts/verify-paddle-credit.ts --url http://localhost:3000
//   npx tsx scripts/verify-paddle-credit.ts --org <existing-org-id>
//
// By default it targets a FRESH throwaway org id (test-paddle-verify-<ts>) so it
// never mutates a real customer. It prints that id at the end; delete the
// orgs/<id> doc + subcollections when done if you want a clean console.
//
// Env: reads PADDLE_WEBHOOK_SECRET + FIREBASE_SERVICE_ACCOUNT_KEY +
// NEXT_PUBLIC_FIREBASE_PROJECT_ID from .env.local (same as the dev server).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    // fall through to manual parse
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const rawLine of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

type Kind = "single_role" | "team" | "wallet_topup";

function buildSignedRequest(
  secret: string,
  body: object,
  opts: { tamper?: boolean } = {}
): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  let h1 = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  if (opts.tamper) h1 = h1.slice(0, -1) + (h1.endsWith("0") ? "1" : "0"); // flip last hex nibble
  return { rawBody, signature: `ts=${ts};h1=${h1}` };
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  ok ? pass++ : fail++;
}

async function main(): Promise<void> {
  await loadEnv();

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PADDLE_WEBHOOK_SECRET missing from .env.local — the dev server would 401 anyway. Aborting.");
    process.exit(1);
  }

  const baseUrl = (argVal("--url") ?? "http://localhost:3000").replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/api/paddle/webhook`;
  const orgId = argVal("--org") ?? `test-paddle-verify-${Date.now()}`;
  const runId = Date.now();

  // Lazy-import after env load so firebase-admin sees the service account.
  const { getEntitlementSummary } = await import("@/lib/entitlements");
  const { WALLET_MIN_QTY } = await import("@/lib/wallet-config");

  // Confirm the dev server is reachable before we start asserting.
  try {
    await fetch(webhookUrl, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  } catch {
    console.error(`Cannot reach ${webhookUrl}. Is the dev server running?  ->  npm run dev`);
    process.exit(1);
  }

  async function deliver(kind: Kind, quantity: number, txnId: string, tamper = false): Promise<number> {
    const body = {
      event_type: "transaction.completed",
      data: {
        id: txnId,
        custom_data: { orgId, kind },
        items: [{ quantity }],
      },
    };
    const { rawBody, signature } = buildSignedRequest(secret!, body, { tamper });
    const res = await fetch(webhookUrl, {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "application/json", "paddle-signature": signature },
    });
    return res.status;
  }

  const summary = () => getEntitlementSummary(orgId);

  console.log(`\nVerifying Paddle credit path`);
  console.log(`  webhook : ${webhookUrl}`);
  console.log(`  org     : ${orgId}${argVal("--org") ? "" : "  (throwaway — delete orgs/<id> after)"}\n`);

  const before = await summary();
  console.log(`  start   : plan=${before.plan} walletBalance=${before.walletBalance} screensRemaining=${before.screensRemaining}\n`);

  // 1. wallet_topup credits the wallet by quantity.
  const topUp = 1000;
  const txnWallet = `txn_wallet_${runId}`;
  let status = await deliver("wallet_topup", topUp, txnWallet);
  let s = await summary();
  check("wallet_topup credits wallet", status === 200 && s.walletBalance === before.walletBalance + topUp,
    `http=${status} walletBalance ${before.walletBalance} -> ${s.walletBalance} (expected +${topUp})`);

  // 2. Duplicate delivery (Paddle retry) must NOT double-credit.
  const balAfterFirst = s.walletBalance;
  status = await deliver("wallet_topup", topUp, txnWallet); // same txn id
  s = await summary();
  check("duplicate txn is deduped (no double-credit)", status === 200 && s.walletBalance === balAfterFirst,
    `http=${status} walletBalance stayed ${s.walletBalance} (expected unchanged at ${balAfterFirst})`);

  // 3. Out-of-range quantity must be refused (no credit).
  const balBeforeLow = s.walletBalance;
  const lowQty = Math.max(1, WALLET_MIN_QTY - 1);
  status = await deliver("wallet_topup", lowQty, `txn_low_${runId}`);
  s = await summary();
  check("below-min quantity refused", s.walletBalance === balBeforeLow,
    `http=${status} qty=${lowQty} (<${WALLET_MIN_QTY}); walletBalance stayed ${s.walletBalance}`);

  // 4. single_role grant flips the plan.
  status = await deliver("single_role", 1, `txn_single_${runId}`);
  s = await summary();
  check("single_role pass granted", status === 200 && s.plan === "single_role",
    `http=${status} plan=${s.plan} (expected single_role)`);

  // 5. team grant flips the plan (wallet must persist across the pass swap).
  status = await deliver("team", 1, `txn_team_${runId}`);
  s = await summary();
  check("team pass granted; wallet preserved", status === 200 && s.plan === "team" && s.walletBalance === balBeforeLow,
    `http=${status} plan=${s.plan} walletBalance=${s.walletBalance} (expected team / ${balBeforeLow})`);

  // 6. Bad signature must be rejected and credit nothing.
  const balBeforeBad = s.walletBalance;
  status = await deliver("wallet_topup", topUp, `txn_badsig_${runId}`, /* tamper */ true);
  s = await summary();
  check("bad signature rejected (401, no credit)", status === 401 && s.walletBalance === balBeforeBad,
    `http=${status} (expected 401) walletBalance stayed ${s.walletBalance}`);

  const after = await summary();
  console.log(`\n  end     : plan=${after.plan} walletBalance=${after.walletBalance} screensRemaining=${after.screensRemaining}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
