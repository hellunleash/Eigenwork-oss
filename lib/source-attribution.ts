/**
 * Source attribution (ADR-009 §7 "Channel strength", KPI #7) — single source of
 * truth for resolving the channel a candidate arrived through.
 *
 * Pure module: NO React, NO Firebase. Imported by:
 *
 *   app/candidate/page.tsx              — on-mount auto-detect + on-miss self-report
 *   app/api/candidate/evaluate/route.ts — normalizes the submitted value before
 *                                         writing candidates/{id}.matchData.source
 *
 * The product constraint (ADR-009): one intake link "copy once, paste anywhere",
 * so the link can't carry the channel. Attribution is therefore an
 * **auto-detect, ask-only-on-miss** waterfall:
 *   1. `?src=` honored if present (power users).
 *   2. `document.referrer` origin mapped to a channel (zero candidate friction).
 *   3. Empty/unknown referrer (DM / native-app in-app browser) → ask the
 *      candidate, listing only the dark-social buckets (web-trackable sources
 *      are never asked — they were already auto-attributed).
 */

/**
 * Self-report options shown ONLY when auto-detect misses (referrer empty/unknown).
 * Deliberately limited to the dark-social channels + "Other" — web-trackable
 * sources (Hacker News, Google, desktop LinkedIn/Twitter, careers pages) are
 * resolved silently by `referrerToSource` and must never be asked.
 *
 * Order here is the canonical list; the form randomizes display order to curb
 * top-of-list bias (ADR-009 §7).
 */
export const DARK_SOCIAL_BUCKETS = [
  "Referral",
  "LinkedIn",
  "Twitter",
  "Slack / Discord",
  "WhatsApp / text / email",
  "Other",
] as const;

/**
 * Maps a `document.referrer` (a full URL) to a canonical channel name.
 *
 * Covers the shortener/app domains people forget (ADR-009 §7): `lnkd.in`,
 * `t.co`, `x.com`, `news.ycombinator.com`, webmail origins, etc. Matching is on
 * the host (origin), since channel == domain.
 *
 * Returns `null` for an empty/unparseable/unknown referrer — meaning the click
 * came from a DM / native-app in-app browser (which strips the referrer), so the
 * caller should fall back to asking the candidate.
 */
export function referrerToSource(referer: string | null | undefined): string | null {
  if (!referer || typeof referer !== "string") return null;

  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;

  // Strip a leading "www." so "www.linkedin.com" matches "linkedin.com".
  const bare = host.startsWith("www.") ? host.slice(4) : host;

  // Host-suffix match: true when `bare` is `domain` or ends with `.domain`,
  // so subdomains (e.g. "m.facebook.com") match but "notlinkedin.com" does not.
  const matches = (domain: string): boolean =>
    bare === domain || bare.endsWith(`.${domain}`);

  // LinkedIn: shortener (lnkd.in) + main site.
  if (matches("lnkd.in") || matches("linkedin.com")) return "LinkedIn";

  // Twitter / X: shortener (t.co) + both domains.
  if (matches("t.co") || matches("x.com") || matches("twitter.com")) return "Twitter";

  // Hacker News.
  if (matches("news.ycombinator.com") || matches("ycombinator.com")) return "Hacker News";

  // Email: webmail origins. `outlook` covers outlook.com / outlook.office.com /
  // outlook.live.com; also catch a few other common webmail hosts.
  if (
    matches("mail.google.com") ||
    bare.includes("outlook") ||
    matches("mail.yahoo.com") ||
    matches("mail.proton.me") ||
    matches("proton.me")
  ) {
    return "Email";
  }

  // Reddit.
  if (matches("reddit.com") || matches("redd.it")) return "Reddit";

  // Google (search / news / other Google properties). Checked after the more
  // specific mail.google.com above so webmail isn't misattributed to search.
  if (bare === "google.com" || bare.startsWith("google.") || bare.includes(".google.")) {
    return "Google";
  }

  // Unknown origin → treat as dark social so the candidate is asked.
  return null;
}

/**
 * Trims and canonicalizes a raw `?src=` value or a self-report choice into the
 * value persisted on the candidate doc.
 *
 * Returns `null` for empty/whitespace-only input so callers can fall through the
 * waterfall (and so we never write an empty string to Firestore). Known
 * shortener/alias values (e.g. `?src=lnkd.in`) are folded onto their canonical
 * channel; everything else is returned trimmed as-is (the leaderboard is
 * relative, so unrecognized tags are still useful labels).
 */
// Cap on a persisted source label. Canonical channels are short; a longer
// value is a stray `?src=` tag (or abuse) — keep it bounded so a self-report /
// query param can't bloat the candidate doc. 64 chars is generous headroom.
const MAX_SOURCE_LEN = 64;

export function normalizeSource(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().slice(0, MAX_SOURCE_LEN);
  if (!trimmed) return null;

  const ALIASES: Record<string, string> = {
    linkedin: "LinkedIn",
    "lnkd.in": "LinkedIn",
    li: "LinkedIn",
    twitter: "Twitter",
    x: "Twitter",
    "x.com": "Twitter",
    "t.co": "Twitter",
    hn: "Hacker News",
    "hacker news": "Hacker News",
    hackernews: "Hacker News",
    "news.ycombinator.com": "Hacker News",
    email: "Email",
    mail: "Email",
    reddit: "Reddit",
    google: "Google",
    referral: "Referral",
    "slack / discord": "Slack / Discord",
    slack: "Slack / Discord",
    discord: "Slack / Discord",
    "whatsapp / text / email": "WhatsApp / text / email",
    whatsapp: "WhatsApp / text / email",
    other: "Other",
  };

  return ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
