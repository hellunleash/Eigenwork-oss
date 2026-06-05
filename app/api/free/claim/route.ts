import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { getActivePass, grantPass } from "@/lib/entitlements";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET ?? "";
const MIN_SCORE = 0.5;

/** Verify a reCAPTCHA v3 token. If no secret is configured, verification is
 *  skipped (fingerprint-only mode) so the flow works before keys are set. */
async function verifyRecaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const data = (await res.json()) as { success?: boolean; score?: number };
    return Boolean(data.success) && (typeof data.score !== "number" || data.score >= MIN_SCORE);
  } catch {
    return false;
  }
}

function sanitizeFingerprint(fp: unknown): string | null {
  if (typeof fp !== "string") return null;
  const clean = fp.replace(/[^a-f0-9]/gi, "").slice(0, 128);
  return clean.length >= 16 ? clean : null;
}

/**
 * POST /api/free/claim — body { recaptchaToken, fingerprint }
 *
 * Grants the Free pass (100 screens) after a reCAPTCHA + device-fingerprint
 * check. A given device can only ever claim one free grant (deviceClaims is
 * permanent), which is the real free-tier abuse guard. Idempotent: an org that
 * already has a pass just returns ok.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/free/claim";
  try {
    const ctx = await requireOrgMember(req.headers);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const existing = await getActivePass(ctx.orgId);
    if (existing) return NextResponse.json({ ok: true, already: true });

    const body = await req.json().catch(() => ({}));
    const okCaptcha = await verifyRecaptcha(typeof body.recaptchaToken === "string" ? body.recaptchaToken : "");
    if (!okCaptcha) return NextResponse.json({ ok: false, reason: "captcha_failed" }, { status: 403 });

    const db = getAdminDb();
    const fp = sanitizeFingerprint(body.fingerprint);
    if (fp) {
      const ref = db.collection("deviceClaims").doc(fp);
      const snap = await ref.get();
      const claimedByOther = snap.exists && snap.data()?.uid && snap.data()?.uid !== ctx.userId;
      if (claimedByOther) {
        log("warn", "free.device_reuse_blocked", { requestId, route, orgId: ctx.orgId });
        return NextResponse.json({ ok: false, reason: "device_already_claimed" });
      }
      await ref.set({ uid: ctx.userId, orgId: ctx.orgId, claimedAtMs: Date.now() }, { merge: true });
    }

    const passId = await grantPass(ctx.orgId, "free");
    log("info", "free.granted", { requestId, route, orgId: ctx.orgId, hadFingerprint: Boolean(fp) });
    return NextResponse.json({ ok: true, granted: true, passId });
  } catch (err) {
    log("error", "free.claim_failed", { requestId, route }, err);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
}
