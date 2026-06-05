const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET ?? "";

/**
 * Verify a reCAPTCHA v3 token server-side.
 *
 * Graceful degrade: if RECAPTCHA_SECRET is not configured, returns true (so
 * flows work before keys are set — other guards like honeypots / fingerprints
 * still apply). With a secret set, requires success and score >= minScore.
 *
 * Use a conservative minScore on public surfaces (e.g. 0.3 on the candidate
 * intake form) to avoid false-positives on privacy browsers / VPNs.
 */
export async function verifyRecaptcha(token: string, minScore = 0.5): Promise<boolean> {
  if (!RECAPTCHA_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const data = (await res.json()) as { success?: boolean; score?: number };
    return Boolean(data.success) && (typeof data.score !== "number" || data.score >= minScore);
  } catch {
    return false;
  }
}
