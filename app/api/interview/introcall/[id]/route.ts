import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { requireOrgMember } from "@/lib/org";
import { writeRound } from "@/lib/interview/round-writer";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * POST /api/interview/introcall/[id]  — stage-2b intro-call BOOKKEEPING (Phase 2).
 *
 * The intro call is human-run (docs/phase2-plan.md): the founder talks, the app only
 * records that it happened + an optional note, which then flows into the finalist
 * report (compileFinalistReport reads interviewRounds.introCall). No model, no
 * metering — pure bookkeeping via the org-scoped writeRound (ownership: candidate →
 * jd → org, non-owner collapses to 404).
 *
 * Body: { done?: boolean, note?: string } — either or both.
 *   done: true → status "passed" (+ timestamp) · false → back to "not_started".
 *   note: free text, trimmed + bounded (500 chars); "" clears it.
 * Flag-gated (404 when Phase 2 is off).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/introcall/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    if (!id) return notFound();

    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });

    let body: { done?: unknown; note?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      /* empty patch below → 400 */
    }

    const patch: Record<string, unknown> = {
      ...(body.done === true ? { status: "passed", at: Date.now() } : {}),
      ...(body.done === false ? { status: "not_started" } : {}),
      ...(typeof body.note === "string" ? { note: body.note.trim().slice(0, 500) } : {}),
    };
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
    }

    const res = await writeRound(member.orgId, id, "introCall", patch);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

    log("info", "interview.introcall_web", { requestId, route, orgId: member.orgId, candidateId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log("error", "interview.introcall_web_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to update the intro call" }, { status: 500 });
  }
}
