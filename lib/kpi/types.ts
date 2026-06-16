// ---------------------------------------------------------------------------
// lib/kpi/types.ts — the kpi_snapshots/{orgId} snapshot contract (ADR-009)
// ---------------------------------------------------------------------------
// The cron (worker /worker/kpi-aggregate) computes a KpiSnapshot per org and
// writes it to kpi_snapshots/{orgId}; the dashboard reads that single doc via
// GET /api/kpi. This module is the SINGLE source of truth for the shape both
// sides agree on. Keep it in lockstep with the ADR-009 "shared contract" — any
// drift here silently breaks the dashboard tiles. See ADR-009.

/** One interview funnel slice: how many of the selected candidates cleared. */
export type Funnel = {
  selected: number;
  cleared: number;
  /** cleared / selected, or null when nothing was selected. */
  rate: number | null;
};

/** Per-source channel-strength row for the source leaderboard (KPI #7). */
export type KpiSource = {
  name: string;
  submissions: number;
  top10: number;
  selected: number;
  cleared: number;
  hires: number;
  /** top10 / submissions (0 when no submissions). */
  top10Penetration: number;
  /** cleared / selected, or null when nothing was selected. */
  clearRate: number | null;
};

/**
 * The complete per-org KPI snapshot. Every field is fully resolved (no
 * undefined — Firestore rejects it); KPIs whose backing field is not yet
 * written by another unit degrade to null / 0 / [] rather than throwing.
 */
export type KpiSnapshot = {
  orgId: string;
  /** epoch ms when this snapshot was computed. */
  computedAt: number;
  /** trailing window the windowed KPIs cover (default 90 days). */
  windowDays: number;
  /** current quarter label, e.g. "2026-Q3". */
  period: string;

  // #1 Time-to-fill — median(hiredAt − createdAt) over jds hired in window.
  timeToFill: { medianDays: number | null; hires: number; belowThreshold: boolean };

  // #2 Roles filled vs target — hired this quarter / org_targets[period].
  rolesFilled: { hired: number; target: number | null };

  // #3 Offer acceptance — accepted / (offers extended > 14 days ago).
  offerAcceptance: { accepted: number; extended: number; rate: number | null };

  // #4 Inflated profiles surfaced — fraud/AI flag count this calendar month.
  inflatedProfiles: { count: number };

  // #5 Open reqs · pipeline by stage — stage counts across OPEN reqs.
  pipelineByStage: {
    screening: number;
    interviewing: number;
    offer: number;
    hired: number;
    rejected: number;
    withdrawn: number;
    openReqs: number;
  };

  // #6 Shortlist quality — clear rate at depth (top10 / top20 / ranks 11-20).
  shortlistQuality: { top10: Funnel; top20: Funnel; ranks11to20: Funnel };

  // #7 Channel strength — same funnel, sliced by candidate source.
  sources: KpiSource[];
};

/** Firestore doc path for an org's cached KPI snapshot. */
export function kpiSnapshotDocPath(orgId: string): string {
  return `kpi_snapshots/${orgId}`;
}
