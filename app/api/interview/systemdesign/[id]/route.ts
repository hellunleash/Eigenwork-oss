import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { allowRequest } from "@/lib/rate-limit";
import { getSystemDesignForCandidate, submitSystemDesign } from "@/lib/interview/systemdesign-orchestrate";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Candidate-facing stage-4 system-design route (Phase 2). TOKEN-authed (no login):
 * /interview/[id]/systemdesign?t=<accessToken>. Flag-gated (404 when Phase 2 is off →
 * dark in prod) and rate-limited. All non-authorized outcomes collapse to 404.
 *
 *   GET  -> the invite-gated design scenario
 *   POST -> submit the free-text design response; scores on submit
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function clientKey(req: Request, id: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `interview-systemdesign:${ip}:${id}`;
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/systemdesign/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!id || !token) return notFound();

    const rl = await allowRequest({ key: clientKey(req, id), limit: 30, windowSeconds: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const res = await getSystemDesignForCandidate(id, token);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ status: res.status, prompt: res.prompt });
  } catch (err) {
    log("error", "interview.systemdesign_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load the exercise" }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/systemdesign/[id]";
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
    const hp = (body as { website?: unknown })?.website;
    if (typeof hp === "string" && hp.trim() !== "") return NextResponse.json({ ok: true });

    const b = body as { response?: unknown; consent?: unknown };
    const res = await submitSystemDesign(id, token, b.response, b.consent === true);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log("error", "interview.systemdesign_post_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to submit the exercise" }, { status: 500 });
  }
}
