import { NextResponse } from "next/server";
import { interviewsEnabled } from "@/lib/interview/flags";
import { requireOrgMember } from "@/lib/org";
import { resolveOwnedCandidate } from "@/lib/interview/candidate-access";
import { compileFinalistReport } from "@/lib/interview/report";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * Recruiter-facing finalist report route (Phase 2, Step 4). Unlike the candidate
 * routes (token-authed), this is RECRUITER-authed: requireOrgMember resolves the actor,
 * orgId comes from the actor (never the client), and resolveOwnedCandidate re-checks the
 * candidate → jd → org ownership chain (non-owner/missing collapses to 404). Flag-gated
 * (404 when Phase 2 is off → dark in prod).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/interview/report/[id]";
  try {
    if (!interviewsEnabled()) return notFound();
    const { id } = await context.params;
    if (!id) return notFound();

    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });

    const owned = await resolveOwnedCandidate(member.orgId, id);
    if ("error" in owned) return NextResponse.json({ error: owned.error.message }, { status: owned.error.status });

    const report = compileFinalistReport(owned.candidate, owned.jd);
    return NextResponse.json({ report });
  } catch (err) {
    log("error", "interview.report_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to build the report" }, { status: 500 });
  }
}
