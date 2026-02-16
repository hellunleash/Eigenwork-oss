import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side checkout is disabled. Checkout is now client-side via Paddle.js (Paddle Billing V2 Sandbox).
 * Use Paddle.Checkout.open() from the frontend with NEXT_PUBLIC_PADDLE_CLIENT_TOKEN and /api/paddle/config for priceId.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Checkout is client-side; use Paddle.js with Paddle.Checkout.open()" },
    { status: 410 }
  );
}
