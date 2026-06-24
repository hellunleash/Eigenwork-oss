import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed OAuth state (ADR-010 Phase 1).
 *
 * The "Add to Slack" flow starts from an AUTHENTICATED EigenWork request, but the
 * Slack OAuth redirect comes back as an unauthenticated top-level navigation. We
 * carry the installer's identity across the round-trip in a short-lived,
 * HMAC-signed `state` parameter so the callback knows which org to link — without
 * trusting any client-supplied value.
 */
const SECRET = process.env.SLACK_STATE_SECRET || process.env.SLACK_SIGNING_SECRET || "";
const TTL_MS = 10 * 60 * 1000;

export function signState(payload: { uid: string; orgId: string }): string {
  const body = JSON.stringify({ uid: payload.uid, orgId: payload.orgId, exp: Date.now() + TTL_MS });
  const b64 = Buffer.from(body).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyState(state: string | null): { uid: string; orgId: string } | null {
  if (!state || !SECRET) return null;
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString()) as {
      uid?: string;
      orgId?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.orgId || typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
      return null;
    }
    return { uid: parsed.uid, orgId: parsed.orgId };
  } catch {
    return null;
  }
}
