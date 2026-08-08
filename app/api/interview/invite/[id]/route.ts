import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { requireOrgMember } from "@/lib/org";
import { inviteToScreen } from "@/lib/interview/screen-orchestrate";
import { inviteToTakeHome } from "@/lib/interview/takehome-orchestrate";
import { inviteToSystemDesign } from "@/lib/interview/systemdesign-orchestrate";
import { resolveOwnedCandidate } from "@/lib/interview/candidate-access";
import { interviewLink, isInterviewRoundKey } from "@/lib/interview/links";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * POST /api/interview/invite/[id]  — recruiter-side round invite (Phase 2).
 *
 * The WEB PEER of the Slack `interview_invite_confirm` handler (multi-entry: one
 * engine, two front doors) — the same inviteTo* orchestrators, the same metering,
 * the same tokenized candidate link. Body: { round: "screen"|"takeHome"|"systemDesign" }.
 * Idempotent like Slack: re-inviting returns the same link, no regen, no recharge.
 *
 * RECRUITER-authed: requireOrgMember resolves the actor, orgId comes from the actor
 * (never the client), and each inviteTo* re-checks candidate → jd → org ownership
 * (non-owner/missing collapses to 404). Flag-gated (404 when Phase 2 is off).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/invite/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    if (!id) return notFound();

    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });

    let body: { round?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      /* invalid below */
    }
    const round = body.round;
    if (!isInterviewRoundKey(round)) {
      return NextResponse.json({ error: "invalid_round" }, { status: 400 });
    }

    // Same dispatch as the Slack confirm handler: each inviteTo* re-checks org
    // ownership from the resolved actor and meters one interview credit per candidate.
    const invite = round === "screen" ? inviteToScreen : round === "takeHome" ? inviteToTakeHome : inviteToSystemDesign;
    const res = await invite(member.orgId, id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    // The candidate link needs the doc's accessToken — re-resolve under the same
    // ownership chain (mirrors the Slack handler exactly).
    const owned = await resolveOwnedCandidate(member.orgId, id);
    const token = "error" in owned ? "" : typeof owned.candidate.accessToken === "string" ? owned.candidate.accessToken : "";
    if (!token) return NextResponse.json({ error: "link_unavailable" }, { status: 500 });

    log("info", "interview.invite_web", { requestId, route, orgId: member.orgId, candidateId: id, round });
    return NextResponse.json({
      ok: true,
      alreadyInvited: res.alreadyInvited === true,
      link: interviewLink(id, round, token),
    });
  } catch (err) {
    log("error", "interview.invite_web_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to send the invite" }, { status: 500 });
  }
}
