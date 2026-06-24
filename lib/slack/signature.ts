import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Slack request signature (ADR-010 guardrail 1).
 *
 * Slack signs every request: `v0=HMAC-SHA256(signingSecret, "v0:{ts}:{rawBody}")`.
 * We compare against the X-Slack-Signature header with a timing-safe equal, and
 * reject requests older than 5 minutes (replay protection). The RAW body must be
 * used — parse JSON only AFTER this passes.
 */
export function verifySlackSignature(params: {
  signingSecret: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): boolean {
  const { signingSecret, rawBody, signature, timestamp } = params;
  if (!signingSecret || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
