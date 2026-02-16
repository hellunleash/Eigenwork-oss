/**
 * Paddle Billing SDK client for server-side use.
 * Uses PADDLE_API_KEY and PADDLE_ENV (sandbox | production).
 * Production: Environment.production with production API key and price ID.
 */
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const PADDLE_API_KEY = process.env.PADDLE_API_KEY ?? "";
const PADDLE_ENV = process.env.PADDLE_ENV ?? "production";

const paddleClient =
  PADDLE_API_KEY && PADDLE_ENV === "sandbox"
    ? new Paddle(PADDLE_API_KEY, { environment: Environment.sandbox })
    : PADDLE_API_KEY
      ? new Paddle(PADDLE_API_KEY, { environment: Environment.production })
      : null;

export function getPaddle(): Paddle | null {
  return paddleClient;
}

export { Environment };
