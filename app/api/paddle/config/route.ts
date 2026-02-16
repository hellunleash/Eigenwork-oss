import { NextResponse } from "next/server";

const PADDLE_PRICE_ID = process.env.PADDLE_PRICE_ID ?? "";

/**
 * GET /api/paddle/config
 * Returns { priceId } for client-side Paddle.js checkout. No auth required; price ID is not secret.
 */
export async function GET() {
  if (!PADDLE_PRICE_ID) {
    return NextResponse.json({ error: "Paddle not configured" }, { status: 500 });
  }
  return NextResponse.json({ priceId: PADDLE_PRICE_ID });
}
