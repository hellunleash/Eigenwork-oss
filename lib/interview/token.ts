/**
 * Constant-time per-candidate access-token comparison (Phase 2).
 *
 * Mirrors the `tokensMatch` used by app/api/candidate/[id]/route.ts self-mode — the
 * candidate authenticates to their own interview surface with the `accessToken`
 * written on their candidate doc at submission time (no login). Timing-safe so the
 * token can't be discovered by response-time probing.
 */
import { timingSafeEqual } from "crypto";

export function tokensMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
