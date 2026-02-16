import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { updateUserEigenCredits } from "@/lib/user-credits";

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
    const customData =
      (data.customData as Record<string, unknown> | null | undefined) ??
      ((data as { custom_data?: Record<string, unknown> }).custom_data ?? null) ??
      (data.transaction as Record<string, unknown> | undefined)?.customData ??
      ((data.transaction as { custom_data?: Record<string, unknown> } | undefined)?.custom_data ?? null) ??
      (data.checkout as Record<string, unknown> | undefined)?.customData ??
      ((data.checkout as { custom_data?: Record<string, unknown> } | undefined)?.custom_data ?? null);
    const rawUserId =
      (customData as { userId?: unknown } | null | undefined)?.userId;
    const userId = typeof rawUserId === "string" ? rawUserId : undefined;

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

    if (userId && quantity > 0) {
      try {
        await updateUserEigenCredits(userId, quantity);
      } catch (err) {
        console.error("Paddle webhook updateUserEigenCredits error:", err);
      }
    } else if (!userId) {
      console.warn("Paddle webhook missing userId in customData; skipping EigenCredits update.");
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
    console.error("Paddle webhook signature verification failed:", err);
    return false;
  }
}
