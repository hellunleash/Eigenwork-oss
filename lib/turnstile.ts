const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET ?? "";

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Graceful degrade: if TURNSTILE_SECRET is unset, returns true (so flows work
 * before keys are set — the honeypot / fingerprint guards still apply). With a
 * secret set, requires a successful challenge. Turnstile is pass/fail (no
 * tunable score), which is exactly what "block bots before spending a screen"
 * needs. Unlimited free, privacy-preserving (no cookies). See
 * https://developers.cloudflare.com/turnstile/.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
