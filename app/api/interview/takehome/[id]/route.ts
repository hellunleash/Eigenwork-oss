import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { allowRequest } from "@/lib/rate-limit";
import { getTakeHomeForCandidate, submitTakeHome } from "@/lib/interview/takehome-orchestrate";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Candidate-facing stage-4 take-home route (Phase 2). TOKEN-authed (no login):
 * /interview/[id]/takehome?t=<accessToken>. Flag-gated (404 when Phase 2 is off → dark
 * in prod) and rate-limited. All non-authorized outcomes collapse to 404.
 *
 *   GET  -> the invite-gated assignment + reactive probe questions
 *   POST -> submit repo url + walkthrough + probe answers; scores on submit
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function clientKey(req: Request, id: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `interview-takehome:${ip}:${id}`;
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/takehome/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!id || !token) return notFound();

    const rl = await allowRequest({ key: clientKey(req, id), limit: 30, windowSeconds: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const res = await getTakeHomeForCandidate(id, token);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ status: res.status, assignment: res.assignment, probeQuestions: res.probeQuestions });
  } catch (err) {
    log("error", "interview.takehome_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load the assignment" }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/takehome/[id]";
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

    const b = body as { url?: unknown; walkthrough?: unknown; answers?: unknown; consent?: unknown };
    const res = await submitTakeHome(id, token, { url: b.url, walkthrough: b.walkthrough, answers: b.answers }, b.consent === true);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log("error", "interview.takehome_post_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to submit the assignment" }, { status: 500 });
  }
}
