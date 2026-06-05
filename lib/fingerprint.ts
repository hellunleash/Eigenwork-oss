/**
 * Lightweight client-side device fingerprint — a deterrent layer against
 * free-tier farming, not a bulletproof identity. Combines stable browser
 * signals and hashes them to a hex id. A real hardening upgrade is
 * FingerprintJS Pro; this raises the bar against casual multi-account abuse.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const parts = [
      nav.userAgent,
      nav.language,
      (nav.languages ?? []).join(","),
      String(nav.hardwareConcurrency ?? ""),
      String(nav.deviceMemory ?? ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(new Date().getTimezoneOffset()),
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      canvasFingerprint(),
    ];
    return await sha256Hex(parts.join("§"));
  } catch {
    return "";
  }
}

function canvasFingerprint(): string {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("EigenWork-fp", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("EigenWork-fp", 4, 17);
    return c.toDataURL();
  } catch {
    return "";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
