/**
 * Finalist report compiler (Phase 2, Step 4 capstone). PURE — assembles the whole
 * funnel (résumé/ETI signal → intro call → screen → take-home → system design) into one
 * typed dossier for the founder, reading ONLY persisted fields (no IO/LLM), so it's
 * unit-tested by scripts/qa-interview-foundation.ts and safe to import anywhere.
 *
 * ASSISTIVE POSTURE (load-bearing): the `recommendation` is a SUGGESTION derived
 * deterministically from each round's `suggestedAdvance` — it never decides. Advance /
 * reject is always a human click. `whatToProbe` hands the founder the exact doubts to
 * press on in the final interview (the flags the engine + rounds already raised).
 */
import type { Scorecard } from "@/lib/interview/rounds";
import { readRounds } from "@/lib/interview/rounds";
import { plannedAppRounds } from "@/lib/interview/plan";
import { isSeniorTrack, resolveInterviewPlan } from "@/lib/interview/context";
import { cardFrom, type InterviewCard } from "@/lib/interview/prompt-util";

type Doc = Record<string, unknown> | null | undefined;

export type ReportRecommendation = {
  suggested: "advance" | "hold" | "pass" | "incomplete";
  roundsScored: number;
  roundsAdvancing: number;
  rationale: string;
};

export type FinalistReport = {
  candidateName: string;
  roleTitle: string;
  track: "senior" | "junior";
  resume: { score: number | null; card: InterviewCard | null; workHistory: unknown };
  rounds: {
    introCall: { status: string; note?: string } | null;
    screen: Scorecard | null;
    takeHome: { scorecard: Scorecard | null; repoUrl?: string } | null;
    systemDesign: Scorecard | null;
  };
  recommendation: ReportRecommendation;
  whatToProbe: string[];
  disclaimer: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function flagsOf(sc: Scorecard | null | undefined): string[] {
  return sc && Array.isArray(sc.flags) ? sc.flags : [];
}

/** PURE. Compile the finalist dossier from a candidate + JD doc. */
export function compileFinalistReport(candidate: Doc, jd: Doc): FinalistReport {
  const c = (candidate ?? {}) as Record<string, unknown>;
  const rounds = readRounds(candidate);
  const senior = isSeniorTrack(candidate, jd);
  const card = cardFrom(c.card);

  const screen = rounds.screen?.scorecard ?? null;
  const takeHomeSc = rounds.takeHome?.scorecard ?? null;
  const systemDesign = rounds.systemDesign?.scorecard ?? null;

  const scored = [screen, takeHomeSc, systemDesign].filter((s): s is Scorecard => !!s);
  const advancing = scored.filter((s) => s.suggestedAdvance).length;

  // How many app-run rounds this role actually PLANS to run (enabled in the interview
  // plan) — so we never say "advance" off a partial funnel (e.g. screen passed but the
  // take-home + system-design were never run).
  const plan = resolveInterviewPlan(jd, senior);
  const plannedCount = plannedAppRounds(plan).length;

  let suggested: ReportRecommendation["suggested"];
  let rationale: string;
  if (scored.length === 0) {
    suggested = "incomplete";
    rationale = "No interview rounds have been scored yet — nothing to recommend.";
  } else if (plannedCount > scored.length) {
    suggested = "incomplete";
    rationale = `Only ${scored.length} of ${plannedCount} planned interview rounds are scored so far.`;
  } else if (advancing === scored.length) {
    suggested = "advance";
    rationale = `All ${scored.length} scored round(s) recommend advancing.`;
  } else if (advancing === 0) {
    suggested = "pass";
    rationale = `None of the ${scored.length} scored round(s) reached the advance bar.`;
  } else {
    suggested = "hold";
    rationale = `${advancing} of ${scored.length} scored round(s) recommend advancing — a judgment call.`;
  }

  const probes = [card?.flag ?? "", ...flagsOf(screen), ...flagsOf(takeHomeSc), ...flagsOf(systemDesign)]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const whatToProbe = Array.from(new Set(probes)).slice(0, 10);

  const ic = rounds.introCall;
  const introCall = ic
    ? { status: str(ic.status) || "not_started", ...(typeof ic.note === "string" && ic.note ? { note: ic.note } : {}) }
    : null;

  const repoUrl = rounds.takeHome?.submission?.url;

  return {
    candidateName: str(c.candidateName) || "Candidate",
    roleTitle: str(jd?.title) || "this role",
    track: senior ? "senior" : "junior",
    resume: { score: num(c.score), card, workHistory: c.work_history ?? [] },
    rounds: {
      introCall,
      screen,
      takeHome: rounds.takeHome ? { scorecard: takeHomeSc, ...(repoUrl ? { repoUrl } : {}) } : null,
      systemDesign,
    },
    recommendation: { suggested, roundsScored: scored.length, roundsAdvancing: advancing, rationale },
    whatToProbe,
    disclaimer: "Assistive only — every score is a recommendation; advance/reject is a human decision.",
  };
}
