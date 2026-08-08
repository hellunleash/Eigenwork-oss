import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { allowRequest } from "@/lib/rate-limit";
import { getScreenForCandidate, submitScreen } from "@/lib/interview/screen-orchestrate";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Candidate-facing stage-3 screen route (Phase 2). TOKEN-authed (no login): the
 * candidate opens /interview/[id]?t=<accessToken>. Flag-gated (404 when Phase 2 is
 * off, so it's dark in prod) and rate-limited. All non-authorized outcomes collapse
 * to 404 — enumeration-resistant, matching the rest of the codebase.
 *
 *   GET  -> fetch (lazy-generate on first open) the candidate's screen questions
 *   POST -> submit answers; the orchestration scores + persists (score-on-submit)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function clientKey(req: Request, id: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `interview-screen:${ip}:${id}`;
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/screen/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!id || !token) return notFound();

    const rl = await allowRequest({ key: clientKey(req, id), limit: 30, windowSeconds: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const res = await getScreenForCandidate(id, token);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ status: res.status, questions: res.questions });
  } catch (err) {
    log("error", "interview.screen_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load the screen" }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/screen/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!id || !token) return notFound();

    const rl = await allowRequest({ key: clientKey(req, id), limit: 10, windowSeconds: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    // Honeypot: a filled hidden field means a bot — accept silently, persist nothing.
    const hp = (body as { website?: unknown })?.website;
    if (typeof hp === "string" && hp.trim() !== "") return NextResponse.json({ ok: true });

    const consent = (body as { consent?: unknown })?.consent === true;
    const res = await submitScreen(id, token, (body as { answers?: unknown })?.answers, consent);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log("error", "interview.screen_post_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to submit the screen" }, { status: 500 });
  }
}
