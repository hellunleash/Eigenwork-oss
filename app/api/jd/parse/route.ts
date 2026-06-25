import { NextResponse } from "next/server";
import { parseJdText } from "@/lib/jd-parse";
import { requireFirebaseUser } from "@/lib/auth-server";
import { allowRequest } from "@/lib/rate-limit";
import { getRequestId, log, timeMs } from "@/lib/server-logger";

/**
 * Parse pasted JD text into structured fields + role anchors. The actual model
 * logic now lives in lib/jd-parse.ts (shared with the Slack agent's intake tool);
 * this route owns auth, the per-user rate limit, and the length cap.
 */

// JD length cap. Realistic JDs are 1-10k chars; very long ones reach ~15k. 50k is
// ~12,500 words / 25 pages — 5-10x the longest legitimate JD. Pure abuse guard.
const MAX_JD_CHARS = 50_000;

// Per-authenticated-user rate limit. A founder parses a JD 1-3 times per create
// flow; 30/min leaves room while keeping one account from draining Gemini quota.
const PER_USER_PARSE_LIMIT = 30;
const PER_USER_PARSE_WINDOW_SECONDS = 60;

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/parse";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rl = await allowRequest({
      key: `jd_parse:${auth.userId}`,
      limit: PER_USER_PARSE_LIMIT,
      windowSeconds: PER_USER_PARSE_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      log("warn", "rate_limit.jd_parse_blocked", { requestId, route, userId: auth.userId, resetAtMs: rl.resetAtMs });
      const retryAfterSec = Math.max(1, Math.ceil((rl.resetAtMs - Date.now()) / 1000));
      return NextResponse.json(
        { error: "rate_limited", message: "Too many parse attempts in a short window. Try again shortly.", retryAfter: retryAfterSec },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const { jd } = await req.json();
    if (!jd || typeof jd !== "string") {
      return NextResponse.json({ error: "JD text is required" }, { status: 400 });
    }
    if (jd.length > MAX_JD_CHARS) {
      log("warn", "jd.too_long", { requestId, route, userId: auth.userId, chars: jd.length });
      return NextResponse.json(
        { error: "jd_too_long", message: "Job description is unusually long. Please trim to under 50,000 characters." },
        { status: 413 }
      );
    }

    const t = timeMs();
    const parsed = await parseJdText(jd, { requestId, route, userId: auth.userId });
    log("info", "jd.parse_ok", { requestId, route, userId: auth.userId, latencyMs: t() });
    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    log("error", "jd.parse_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
