/**
 * Canonical candidate interview round-tracking schema (Phase 2 — docs/phase2-plan.md).
 *
 * SINGLE source of truth for WHERE round data lives on `candidates/{id}` and its
 * shape (resolves critic blocker "1z": every slice was scattering round data across
 * .stage3 / .rounds / .interviewRounds / flat .screen, so writer and reader compiled
 * green but pointed at different paths and nothing surfaced). Every writer/reader
 * MUST import `ROUND_ROOT` / `roundPath` / `readRounds` — never hardcode a path.
 *
 * Isolation: this is an ADDITIVE optional map on the candidate doc — absent for
 * every pre-Phase-2 candidate, so nothing existing reads or breaks. Pure module
 * (no Firestore import) so it's unit-testable and safe to import anywhere.
 */

/** The one literal container key for round data on candidates/{id}. */
export const ROUND_ROOT = "interviewRounds" as const;

export type RoundStatus =
  | "not_started"
  | "invited"
  | "in_progress"
  | "submitted"
  | "scored"
  | "passed"
  | "failed";

export type RoundCost = { inputTokens: number; outputTokens: number; usd: number };

export type ScorecardDimension = { name: string; score: number; max: number; note: string };

/** The shared shape every auto-scored round emits. `suggestedAdvance` is a
 *  RECOMMENDATION only — advance/reject is always a human click (assistive posture). */
export type Scorecard = {
  overall: number;
  dimensions: ScorecardDimension[];
  summary: string;
  suggestedAdvance: boolean;
  flags?: string[];
  cost?: RoundCost;
};

export type ScreenQuestion = { id: string; kind: "code" | "probe"; prompt: string };
export type ScreenAnswer = { id: string; text: string };

export type IntroCallRound = { status: RoundStatus; note?: string; at?: number };

export type ScreenRound = {
  status: RoundStatus;
  questions?: ScreenQuestion[];
  answers?: ScreenAnswer[];
  scorecard?: Scorecard;
  invitedAt?: number;
  submittedAt?: number;
  /** Recorded AEDT/automated-processing consent (LL144 posture), stamped at submit. */
  consent?: { acceptedAt: number; noticeVersion: string };
};

export type TakeHomeSubmission = {
  format: "repo" | "upload" | "link";
  url?: string;
  filePath?: string;
  walkthrough?: string;
};

export type TakeHomeRound = {
  status: RoundStatus;
  /** The assignment shown to the candidate (recruiter-authored, or generated at invite). */
  prompt?: string;
  submission?: TakeHomeSubmission;
  scorecard?: Scorecard;
  invitedAt?: number;
  submittedAt?: number;
  /** Reactive probe — questions the candidate answers with their submission to expose
   *  the thinking behind their build (the async analog of watching them build). */
  probe?: { questions?: ScreenQuestion[]; answers?: ScreenAnswer[] };
  /** Recorded AEDT/automated-processing consent, stamped at submit. */
  consent?: { acceptedAt: number; noticeVersion: string };
};

export type SystemDesignRound = {
  status: RoundStatus;
  prompt?: string;
  response?: string;
  scorecard?: Scorecard;
  invitedAt?: number;
  submittedAt?: number;
  /** Recorded AEDT/automated-processing consent, stamped at submit. */
  consent?: { acceptedAt: number; noticeVersion: string };
};

export type CandidateRounds = {
  introCall?: IntroCallRound;
  screen?: ScreenRound;
  takeHome?: TakeHomeRound;
  systemDesign?: SystemDesignRound;
};

export type RoundKey = keyof CandidateRounds;

/** Read the canonical rounds object off a candidate doc's data. Never throws;
 *  returns {} when absent (every pre-Phase-2 candidate). */
export function readRounds(candidateData: Record<string, unknown> | null | undefined): CandidateRounds {
  const raw = candidateData?.[ROUND_ROOT];
  return raw && typeof raw === "object" ? (raw as CandidateRounds) : {};
}

/** Canonical Firestore dot-path for a round (+ optional sub-field). The ONLY way to
 *  address round data — never hardcode "interviewRounds.screen" anywhere else. */
export function roundPath(round: RoundKey, field?: string): string {
  return field ? `${ROUND_ROOT}.${round}.${field}` : `${ROUND_ROOT}.${round}`;
}
