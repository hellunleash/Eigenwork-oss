/**
 * Screen Wallet (prepaid overage) — single source of truth for the price
 * and per-top-up quantity bounds. Imported by:
 *
 *   app/user/billing/page.tsx       — UI input + price display + clamps
 *   app/api/paddle/webhook/route.ts — server-side credit guard
 *   app/pricing/page.tsx            — public pricing copy + SEO metadata
 *
 * Changing any value here is a pricing/UX decision. The pricing page copy
 * (and Paddle's product price) need to move with it.
 */

export const WALLET_UNIT_PRICE = 0.15;
export const WALLET_MIN_QTY = 100;
export const WALLET_MAX_QTY = 100_000;
