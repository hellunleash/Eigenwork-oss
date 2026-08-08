import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/org";
import { interviewsEnabled } from "@/lib/interview/flags";
import { readRounds, type Scorecard } from "@/lib/interview/rounds";
import { plannedAppRounds } from "@/lib/interview/plan";
import { isSeniorTrack, resolveInterviewPlan } from "@/lib/interview/context";
import { interviewCreditsRemaining } from "@/lib/interview/interview-credits";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/jd/[jobId]/interviews  (ADR-009 — the "Interviewing surface")
 *
 * Read-only listing of a role's shortlist with each candidate's CURRENT stage,
 * for the post-screening interview-tracking page. Deliberately lightweight:
 *   - reads the persisted shortlist (jds.matchResult.top20) — NO Gemini match
 *     (unlike GET /api/jd/match, which re-runs the match when uncached);
 *   - batch-reads the live candidate docs only for the stage fields, so the
 *     stage reflects reality after a recruiter has moved someone.
 *
 * Rank is taken from the top20 order (index+1). Owner-guarded via jds.orgId.
 * Enumeration-resistant: non-owner / missing collapses to 404.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jobId: string }> };

type ShortlistEntry = {
  id: string;
  candidateName?: string;
  score?: number;
  card?: { flag?: string | null } | null;
};

// --- Phase 2 (flag-gated) — per-candidate round progress for the recruiter UI ------
//
// When PHASE2_INTERVIEWS_ENABLED is off this block never runs and the payload is
// byte-identical to the ADR-009 shape, so prod is unaffected (isolation contract).
// Deliberately a BRIEF: statuses + overall + suggestedAdvance only — the full
// scorecards live on the finalist report (/api/interview/report/[id]).

type RoundBrief = { status: string; overall: number | null; suggestedAdvance: boolean | null };

type InterviewBrief = {
  /** Planned rounds in plan order (introCall when planned + the enabled app-run rounds). */
  planned: string[];
  rounds: {
    introCall: { status: string; note: string | null } | null;
    screen: RoundBrief | null;
    takeHome: RoundBrief | null;
    systemDesign: RoundBrief | null;
  };
};

function briefOf(r: { status?: string; scorecard?: Scorecard } | undefined): RoundBrief | null {
  if (!r || typeof r.status !== "string") return null;
  return {
    status: r.status,
    overall: typeof r.scorecard?.overall === "number" ? r.scorecard.overall : null,
    suggestedAdvance: typeof r.scorecard?.suggestedAdvance === "boolean" ? r.scorecard.suggestedAdvance : null,
  };
}

function interviewBriefOf(live: Record<string, unknown> | null, jd: Record<string, unknown>): InterviewBrief {
  const plan = resolveInterviewPlan(jd, isSeniorTrack(live, jd));
  const planned: string[] = [
    ...(plan.rounds.includes("introCall") ? ["introCall"] : []),
    ...plannedAppRounds(plan),
  ];
  const rounds = readRounds(live);
  const ic = rounds.introCall;
  return {
    planned,
    rounds: {
      introCall: ic && typeof ic.status === "string"
        ? { status: ic.status, note: typeof ic.note === "string" && ic.note ? ic.note : null }
        : null,
      screen: briefOf(rounds.screen),
      takeHome: briefOf(rounds.takeHome),
      systemDesign: briefOf(rounds.systemDesign),
    },
  };
}

// Firestore Timestamp | epoch-ms number | {_seconds}/{seconds} → epoch ms (or null).
// The stage PATCH stamps offer/hire times as serverTimestamps; the client KPIs
// (time-to-fill #1, offer-acceptance #3) need them as plain numbers.
function tsToMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof o.toMillis === "function") return o.toMillis();
    if (typeof o._seconds === "number") return o._seconds * 1000;
    if (typeof o.seconds === "number") return o.seconds * 1000;
  }
  return null;
}

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/[jobId]/interviews";
  try {
    const { jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const db = getAdminDb();
    const jdSnap = await db.collection("jds").doc(jobId).get();
    if (!jdSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const jd = jdSnap.data() as Record<string, unknown>;
    if ((jd.orgId as string | undefined) !== member.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const matchResult = jd.matchResult as { top20?: unknown[] } | undefined;
    const shortlist = Array.isArray(matchResult?.top20) ? (matchResult.top20 as ShortlistEntry[]) : [];

    // Batch-read the live candidate docs for current stage fields. getAll keeps
    // this to a single round trip regardless of shortlist size (<= ~20).
    const refs = shortlist.map((c) => db.collection("candidates").doc(c.id));
    const liveSnaps = refs.length > 0 ? await db.getAll(...refs) : [];
    const liveById = new Map(liveSnaps.map((s) => [s.id, s.exists ? (s.data() as Record<string, unknown>) : null]));

    const phase2 = interviewsEnabled();
    const candidates = shortlist.map((entry, i) => {
      const live = liveById.get(entry.id) ?? null;
      const stage = (typeof live?.stage === "string" ? live.stage : "screening") as string;
      const flagRaw = (live?.card as { flag?: string | null } | undefined)?.flag ?? entry.card?.flag ?? null;
      return {
        // Phase-2 round progress (absent when the flag is off → UI renders nothing new).
        ...(phase2 ? { interview: interviewBriefOf(live, jd) } : {}),
        id: entry.id,
        name: (typeof live?.candidateName === "string" ? live.candidateName : entry.candidateName) || "Candidate",
        eti: typeof live?.score === "number" ? (live.score as number) : (typeof entry.score === "number" ? entry.score : null),
        flag: flagRaw || null,
        rank: i + 1,
        stage,
        interviewOutcome: (typeof live?.interviewOutcome === "string" ? live.interviewOutcome : null) as string | null,
        // ADR-009 funnel/KPI fields (stamped by PATCH /api/candidate/[id]/stage).
        selectedForInterview: live?.selectedForInterview === true,
        offerExtendedAt: tsToMs(live?.offerExtendedAt),
        hiredAt: tsToMs(live?.hiredAt),
      };
    });

    return NextResponse.json({
      jobId,
      title: typeof jd.title === "string" ? jd.title : "",
      seniority: typeof jd.seniority === "string" ? jd.seniority : "",
      hasShortlist: shortlist.length > 0,
      // jds.createdAt anchors time-to-fill (ADR-009 #1) on the client.
      createdAt: tsToMs(jd.createdAt),
      // Phase-2: the org's interview-credit balance, so the invite UI can show the
      // out-of-credits state before a 402 (absent when the flag is off).
      ...(phase2 ? { interviewCredits: await interviewCreditsRemaining(member.orgId) } : {}),
      candidates,
    });
  } catch (err) {
    log("error", "jd.interviews_get_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load interviews" }, { status: 500 });
  }
}
