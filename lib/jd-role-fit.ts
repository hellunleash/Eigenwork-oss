/**
 * Role-fit one-liner helpers (pure, no server deps — safe to import in both the
 * client confirm page and server code). Extracted verbatim from
 * app/user/jd/confirm/page.tsx so the web JD flow AND the Slack agent's
 * intake-link tool build the SAME `role_fit.one_liner` that /api/jd/match reads.
 * Forking these would re-break matching (the bug we just fixed).
 */
export function cleanTitle(title: string): string {
  return (title || "").replace(/\s*\[[^\]]*\]\s*/g, " ").trim().replace(/\s+/g, " ") || "";
}

export function buildOneLiner(
  title: string,
  primary: string[],
  secondary: string[],
  tertiary: string[]
): string {
  const seen = new Set<string>();
  const dedupe = (arr: string[]) =>
    arr.filter((x) => {
      if (seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  const primaryDisplay = dedupe(primary);
  const secondaryDisplay = dedupe(secondary);
  const tertiaryDisplay = dedupe(tertiary);
  const parts: string[] = [];
  if (primaryDisplay.length) parts.push(primaryDisplay.join(", "));
  if (secondaryDisplay.length) parts.push(secondaryDisplay.join(", "));
  if (tertiaryDisplay.length) parts.push(tertiaryDisplay.join(", "));
  const suffix = parts.length ? ` (${parts.join(" | ")})` : "";
  return cleanTitle(title) + suffix;
}
