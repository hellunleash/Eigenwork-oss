import { getAdminAuth } from "@/lib/firebase-admin";

export type AuthResult =
  | { ok: true; userId: string; token: unknown }
  | { ok: false; status: 401; error: "unauthenticated" }
  | { ok: false; status: 403; error: "forbidden" };

function extractBearerToken(headers: Headers): string | null {
  const h = headers.get("authorization") || headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function requireFirebaseUser(headers: Headers): Promise<AuthResult> {
  const token = extractBearerToken(headers);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (!decoded?.uid) return { ok: false, status: 401, error: "unauthenticated" };
    return { ok: true, userId: decoded.uid, token: decoded };
  } catch {
    return { ok: false, status: 401, error: "unauthenticated" };
  }
}

export function sameUserOrForbidden(auth: AuthResult, expectedUserId: string): AuthResult {
  if (!auth.ok) return auth;
  if (auth.userId !== expectedUserId) return { ok: false, status: 403, error: "forbidden" };
  return auth;
}

