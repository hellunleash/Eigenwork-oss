import { NextResponse } from "next/server";

const PRICE_SINGLE_ROLE = process.env.PADDLE_PRICE_SINGLE_ROLE ?? "";
const PRICE_TEAM = process.env.PADDLE_PRICE_TEAM ?? "";
const PRICE_WALLET = process.env.PADDLE_PRICE_WALLET ?? "";
const PRICE_INTERVIEW = process.env.PADDLE_PRICE_INTERVIEW ?? "";

/**
 * GET /api/paddle/config
 *
 * Returns the client-side Paddle price IDs for the three one-time products
 * (ADR-002). No auth required — price IDs are not secret. A null entry means
 * that product's PADDLE_PRICE_* env var is not yet set, so the frontend can
 * hide/disable that purchase until it is.
 */
export async function GET() {
  return NextResponse.json({
    prices: {
      single_role: PRICE_SINGLE_ROLE || null,
      team: PRICE_TEAM || null,
      wallet_topup: PRICE_WALLET || null,
      interview_credits: PRICE_INTERVIEW || null,
    },
  });
}
