import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { markPaddleTransactionProcessed, makeOpId } from "@/lib/credit-ledger";
import { grantPass, creditWallet } from "@/lib/entitlements";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? "";
const SIGNATURE_TOLERANCE_SECONDS = 60 * 5; // 5 minutes per Paddle docs

/**
 * POST /api/paddle/webhook
 * Verifies signature using Paddle Billing HMAC scheme, then on transaction.completed / transaction.paid
 * credits the user (customData.userId) by items quantity sum and returns 200 { success: true }.
 * Uses Request (not NextRequest) and req.text() to preserve raw body for HMAC verification.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/paddle/webhook";
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("paddle-signature");

  if (!PADDLE_WEBHOOK_SECRET || !signatureHeader) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  const parsedSignature = parseSignature(signatureHeader);
  if (!parsedSignature || !isValidSignature(rawBody, parsedSignature)) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event_type?: string;
    occurrence?: string;
    data?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: true });
  }

  const eventType = event.event_type ?? event.occurrence;
  if (eventType === "transaction.completed" || eventType === "transaction.paid") {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const txnId =
      (typeof data.id === "string" ? data.id : undefined) ??
      (typeof (data.transaction as Record<string, unknown> | undefined)?.id === "string"
        ? String((data.transaction as Record<string, unknown>).id)
        : undefined) ??
      (typeof (data.checkout as Record<string, unknown> | undefined)?.id === "string"
        ? String((data.checkout as Record<string, unknown>).id)
        : undefined);
    const customData =
      (data.customData as Record<string, unknown> | null | undefined) ??
      ((data as { custom_data?: Record<string, unknown> }).custom_data ?? null) ??
      (data.transaction as Record<string, unknown> | undefined)?.customData ??
      ((data.transaction as { custom_data?: Record<string, unknown> } | undefined)?.custom_data ?? null) ??
      (data.checkout as Record<string, unknown> | undefined)?.customData ??
      ((data.checkout as { custom_data?: Record<string, unknown> } | undefined)?.custom_data ?? null);
    // ADR-002: new checkouts carry { orgId, kind } in customData.
    const rawOrgId = (customData as { orgId?: unknown } | null | undefined)?.orgId;
    const orgId = typeof rawOrgId === "string" ? rawOrgId : undefined;
    const rawKind = (customData as { kind?: unknown } | null | undefined)?.kind;
    const kind =
      rawKind === "single_role" || rawKind === "team" || rawKind === "wallet_topup"
        ? rawKind
        : undefined;

    const possibleItemCollections: unknown[] = [
      (data.items as Array<{ quantity?: number }> | undefined),
      (data.details as { lineItems?: Array<{ quantity?: number }> } | undefined)?.lineItems,
      (
        (data.transaction as { details?: { lineItems?: Array<{ quantity?: number }> } } | undefined)?.details
      )?.lineItems,
    ];
    let quantity = 0;
    for (const collection of possibleItemCollections) {
      if (Array.isArray(collection) && collection.length > 0) {
        quantity = collection.reduce(
          (sum, item) => sum + (Number((item as { quantity?: number }).quantity) || 0),
          quantity
        );
      }
    }

    const maybeQuantityField =
      (data.quantity as number | undefined) ??
      ((data.transaction as { quantity?: number } | undefined)?.quantity);
    if (!quantity && typeof maybeQuantityField === "number") {
      quantity = Number(maybeQuantityField) || 0;
    }

    if (orgId && kind) {
      try {
        // Idempotency: dedupe on the Paddle transaction id. grantPass/creditWallet
        // are not self-idempotent, so the mark gate must run before them.
        const opId = makeOpId({ source: "paddle", orgId, kind, txnId: txnId ?? "unknown", quantity, eventType });
        if (txnId) {
          const first = await markPaddleTransactionProcessed(txnId, opId);
          if (!first) {
            log("info", "paddle.webhook_duplicate_ignored", { requestId, route, opId, orgId, txnId });
            return NextResponse.json({ success: true });
          }
        }
        if (kind === "wallet_topup") {
          // Variable-quantity wallet top-up: quantity = number of screens.
          await creditWallet({
            orgId,
            screens: quantity,
            opId,
            metadata: { txnId: txnId ?? null, eventType, quantity },
          });
        } else {
          // single_role | team — grant the bundled pass (fixed screen cap).
          await grantPass(orgId, kind, { paddleTransactionId: txnId ?? undefined });
        }
        log("info", "paddle.webhook_granted", { requestId, route, orgId, kind, quantity, txnId });
      } catch (err) {
        log("error", "paddle.webhook_grant_failed", { requestId, route, orgId, kind, txnId, quantity }, err);
      }
    } else {
      log("warn", "paddle.webhook_missing_org_or_kind", { requestId, route, txnId });
    }
  }

  return NextResponse.json({ success: true });
}

function parseSignature(header: string | null): { ts: number; h1: string } | null {
  if (!header) return null;
  const parts = header.split(";").map((part) => part.trim());
  let ts: number | null = null;
  let h1: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!value) continue;
    if (key === "ts") ts = Number(value);
    if (key === "h1") h1 = value;
  }
  if (!ts || !h1) return null;
  return { ts, h1 };
}

function isValidSignature(rawBody: string, signature: { ts: number; h1: string }): boolean {
  try {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signature.ts) > SIGNATURE_TOLERANCE_SECONDS) {
      return false;
    }
    const payload = `${signature.ts}:${rawBody}`;
    const computed = createHmac("sha256", PADDLE_WEBHOOK_SECRET).update(payload).digest();
    const received = Buffer.from(signature.h1, "hex");
    if (computed.length !== received.length) return false;
    return timingSafeEqual(computed, received);
  } catch (err) {
    log("error", "paddle.webhook_sig_verify_failed", { requestId: "unknown", route: "/api/paddle/webhook" }, err);
    return false;
  }
}
