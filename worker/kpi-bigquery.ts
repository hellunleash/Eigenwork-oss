// ---------------------------------------------------------------------------
// worker/kpi-bigquery.ts — BigQuery-backed KPI aggregation (ADR-009 Option A)
// ---------------------------------------------------------------------------
// Computes the 7 KPIs over the BigQuery latest-state views the Firestore→BigQuery
// extension streams into, and the cron writes one kpi_snapshots/{orgId} doc per
// org. Output is the kpi_snapshots/{orgId} contract (lib/kpi/types.ts), so the
// dashboard/reader are untouched.
//
// SCAN COST NOTE: the latest-state views aren't partitioned by org, so each query
// scans the whole changelog. Running one query *per org* would therefore scan the
// changelog N times per run (cost ∝ orgs × total-candidates). So the cron uses the
// BATCHED path (computeAllOrgSnapshots): TWO queries total per run (no org filter),
// grouped by org_id in memory — the changelog is scanned ONCE per run regardless of
// org count. The single-org path (computeKpiSnapshotBQ) stays for ?orgId= manual
// recompute. Both share buildSnapshot() so the numbers are identical.
//
// Views (docs/bigquery/*.sql): `<project>.<dataset>.candidates_latest | jds_latest`.
// Timestamps are projected as UNIX_MILLIS(...) so rows arrive as plain ms numbers.
// If the dataset/views don't exist yet the query throws; the caller logs and skips.

import { BigQuery } from "@google-cloud/bigquery";
import type { Funnel, KpiSnapshot, KpiSource } from "@/lib/kpi/types";

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const DATASET = process.env.BIGQUERY_DATASET ?? "eigenwork_analytics";
const LOCATION = process.env.BIGQUERY_LOCATION ?? "us-central1";

const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_TO_FILL_MIN_HIRES = 3; // below this, time-to-fill is not a trend.
const OFFER_INFLIGHT_DAYS = 14; // offers younger than this are still in-flight.

let _bq: BigQuery | null = null;
function client(): BigQuery {
  if (!PROJECT) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for BigQuery KPI aggregation");
  }
  if (!_bq) _bq = new BigQuery({ projectId: PROJECT });
  return _bq;
}
function tbl(name: string): string {
  return `\`${PROJECT}.${DATASET}.${name}\``;
}

// --- row shapes (aliases mirror the SELECTs below) --------------------------
type JdRow = { org_id: string | null; is_closed: boolean; created_ms: number | null; hired_ms: number | null };
type CandRow = {
  org_id: string | null;
  fraud_risk: number | null;
  overlord_verdict: string | null;
  stage: string | null;
  shortlist_rank: number | null;
  selected_for_interview: boolean;
  interview_outcome: string | null;
  source: string | null;
  offer_extended_ms: number | null;
  offer_accepted_ms: number | null;
  hired_ms: number | null;
  submitted_ms: number | null;
  job_is_closed: boolean;
};

// --- pure helpers ------------------------------------------------------------
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
// BigQuery may return INT64 as a number or a wrapped {value} — coerce defensively.
function asNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number((v as { value?: unknown }).value ?? v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function rateOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
function quarterLabel(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function quarterBounds(d: Date): { start: number; end: number } {
  const q = Math.floor(d.getMonth() / 3);
  return {
    start: new Date(d.getFullYear(), q * 3, 1).getTime(),
    end: new Date(d.getFullYear(), q * 3 + 3, 1).getTime(),
  };
}
function monthBounds(d: Date): { start: number; end: number } {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  };
}
function isInflatedOrSuspicious(verdict: string | null, fraudRisk: number | null): boolean {
  if (verdict === "suspicious" || verdict === "inflated") return true;
  return fraudRisk != null && fraudRisk >= 0.4;
}
function funnelOf(cands: CandRow[]): Funnel {
  let selected = 0;
  let cleared = 0;
  for (const c of cands) {
    if (c.selected_for_interview) selected += 1;
    if (c.interview_outcome === "cleared") cleared += 1;
  }
  return { selected, cleared, rate: rateOrNull(cleared, selected) };
}

// --- row mappers (shared by single-org and batched fetch) -------------------
function mapJdRow(r: Record<string, unknown>): JdRow {
  return {
    org_id: str(r.org_id),
    is_closed: r.is_closed === true,
    created_ms: asNum(r.created_ms),
    hired_ms: asNum(r.hired_ms),
  };
}
function mapCandRow(r: Record<string, unknown>): CandRow {
  return {
    org_id: str(r.org_id),
    fraud_risk: asNum(r.fraud_risk),
    overlord_verdict: str(r.overlord_verdict),
    stage: str(r.stage),
    shortlist_rank: asNum(r.shortlist_rank),
    selected_for_interview: r.selected_for_interview === true,
    interview_outcome: str(r.interview_outcome),
    source: str(r.source),
    offer_extended_ms: asNum(r.offer_extended_ms),
    offer_accepted_ms: asNum(r.offer_accepted_ms),
    hired_ms: asNum(r.hired_ms),
    submitted_ms: asNum(r.submitted_ms),
    job_is_closed: r.job_is_closed === true,
  };
}

// SELECT lists (org_id carried for batched grouping). `whereOrg` filters one org.
function jdQuery(whereOrg: boolean): string {
  return (
    `SELECT org_id, is_closed, UNIX_MILLIS(created_at) AS created_ms, UNIX_MILLIS(hired_at) AS hired_ms ` +
    `FROM ${tbl("jds_latest")}` +
    (whereOrg ? ` WHERE org_id = @orgId` : ``)
  );
}
function candQuery(whereOrg: boolean): string {
  return (
    `SELECT j.org_id AS org_id, SAFE_CAST(c.fraud_risk AS FLOAT64) AS fraud_risk, c.overlord_verdict, c.stage, ` +
    `c.shortlist_rank, c.selected_for_interview, c.interview_outcome, c.source, ` +
    `UNIX_MILLIS(c.offer_extended_at) AS offer_extended_ms, ` +
    `UNIX_MILLIS(c.offer_accepted_at) AS offer_accepted_ms, ` +
    `UNIX_MILLIS(c.hired_at) AS hired_ms, UNIX_MILLIS(c.submitted_at) AS submitted_ms, ` +
    `j.is_closed AS job_is_closed ` +
    `FROM ${tbl("candidates_latest")} AS c ` +
    `JOIN ${tbl("jds_latest")} AS j ON c.job_id = j.job_id` +
    (whereOrg ? ` WHERE j.org_id = @orgId` : ``)
  );
}

// ---------------------------------------------------------------------------
// Pure KPI math — operates on already-fetched rows for ONE org. Shared by the
// single-org and batched paths so the numbers are byte-identical either way.
// ---------------------------------------------------------------------------
function buildSnapshot(
  orgId: string,
  jds: JdRow[],
  cands: CandRow[],
  orgTargets: Record<string, unknown> | null,
  now: number
): KpiSnapshot {
  const nowDate = new Date(now);
  const windowStart = now - WINDOW_DAYS * DAY_MS;
  const quarter = quarterBounds(nowDate);
  const month = monthBounds(nowDate);
  const period = quarterLabel(nowDate);

  // #1 Time-to-fill — median(hiredAt − createdAt) over reqs hired in window.
  const fillDays: number[] = [];
  for (const j of jds) {
    if (j.hired_ms == null || j.created_ms == null) continue;
    if (j.hired_ms < windowStart) continue;
    if (j.hired_ms < j.created_ms) continue;
    fillDays.push((j.hired_ms - j.created_ms) / DAY_MS);
  }
  const ttfHires = fillDays.length;
  const ttfBelow = ttfHires < TIME_TO_FILL_MIN_HIRES;
  const timeToFill = {
    medianDays: ttfBelow ? null : median(fillDays),
    hires: ttfHires,
    belowThreshold: ttfBelow,
  };

  // #2 Roles filled vs target — reqs hired this quarter / org_targets[period].
  let rolesHiredThisQuarter = 0;
  for (const j of jds) {
    if (j.hired_ms != null && j.hired_ms >= quarter.start && j.hired_ms < quarter.end) {
      rolesHiredThisQuarter += 1;
    }
  }
  const rolesFilled = { hired: rolesHiredThisQuarter, target: num(orgTargets?.[period]) };

  // #3 Offer acceptance — accepted / offers extended > 14 days ago.
  let offersAccepted = 0;
  let offersExtended = 0;
  const inflightCutoff = now - OFFER_INFLIGHT_DAYS * DAY_MS;
  for (const c of cands) {
    if (c.offer_accepted_ms != null) offersAccepted += 1;
    if (c.offer_extended_ms != null && c.offer_extended_ms <= inflightCutoff) offersExtended += 1;
  }
  const offerAcceptance = {
    accepted: offersAccepted,
    extended: offersExtended,
    rate: rateOrNull(offersAccepted, offersExtended),
  };

  // #4 Inflated profiles surfaced — flagged candidates THIS CALENDAR MONTH.
  let inflatedCount = 0;
  for (const c of cands) {
    if (c.submitted_ms == null || c.submitted_ms < month.start || c.submitted_ms >= month.end) continue;
    if (isInflatedOrSuspicious(c.overlord_verdict, c.fraud_risk)) inflatedCount += 1;
  }
  const inflatedProfiles = { count: inflatedCount };

  // #5 Open reqs · pipeline by stage — stage counts across OPEN reqs.
  const stageCounts = { screening: 0, interviewing: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 };
  for (const c of cands) {
    if (c.job_is_closed !== false) continue; // only OPEN reqs.
    const stage = (c.stage ?? "screening") as keyof typeof stageCounts;
    if (stage in stageCounts) stageCounts[stage] += 1;
    else stageCounts.screening += 1; // unknown stage value → screening default.
  }
  let openReqs = 0;
  for (const j of jds) if (j.is_closed === false) openReqs += 1;
  const pipelineByStage = { ...stageCounts, openReqs };

  // #6 Shortlist quality — clear rate at depth (top10 / top20 / ranks 11-20).
  const top10Cands: CandRow[] = [];
  const top20Cands: CandRow[] = [];
  const ranks11to20Cands: CandRow[] = [];
  for (const c of cands) {
    const rank = c.shortlist_rank;
    if (rank == null) continue;
    if (rank >= 1 && rank <= 20) top20Cands.push(c);
    if (rank >= 1 && rank <= 10) top10Cands.push(c);
    if (rank >= 11 && rank <= 20) ranks11to20Cands.push(c);
  }
  const shortlistQuality = {
    top10: funnelOf(top10Cands),
    top20: funnelOf(top20Cands),
    ranks11to20: funnelOf(ranks11to20Cands),
  };

  // #7 Channel strength — same funnel grouped by source.
  type Agg = { submissions: number; top10: number; selected: number; cleared: number; hires: number };
  const bySource = new Map<string, Agg>();
  for (const c of cands) {
    const name = c.source ?? "Unknown";
    let agg = bySource.get(name);
    if (!agg) {
      agg = { submissions: 0, top10: 0, selected: 0, cleared: 0, hires: 0 };
      bySource.set(name, agg);
    }
    agg.submissions += 1;
    if (c.shortlist_rank != null && c.shortlist_rank <= 10) agg.top10 += 1;
    if (c.selected_for_interview) agg.selected += 1;
    if (c.interview_outcome === "cleared") agg.cleared += 1;
    if (c.hired_ms != null) agg.hires += 1;
  }
  const sources: KpiSource[] = [...bySource.entries()]
    .map(([name, a]) => ({
      name,
      submissions: a.submissions,
      top10: a.top10,
      selected: a.selected,
      cleared: a.cleared,
      hires: a.hires,
      top10Penetration: a.submissions > 0 ? a.top10 / a.submissions : 0,
      clearRate: rateOrNull(a.cleared, a.selected),
    }))
    .sort((x, y) => y.submissions - x.submissions);

  return {
    orgId,
    computedAt: now,
    windowDays: WINDOW_DAYS,
    period,
    timeToFill,
    rolesFilled,
    offerAcceptance,
    inflatedProfiles,
    pipelineByStage,
    shortlistQuality,
    sources,
    // Trend history is appended by the cron (handleKpiAggregate) from the
    // previous snapshot — buildSnapshot is pure and has no Firestore access.
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Single-org path (manual ?orgId= recompute) — filtered queries, then math.
// ---------------------------------------------------------------------------
export async function computeKpiSnapshotBQ(
  orgId: string,
  orgTargets: Record<string, unknown> | null
): Promise<KpiSnapshot> {
  const bq = client();
  const [jdRes, candRes] = await Promise.all([
    bq.query({ query: jdQuery(true), params: { orgId }, location: LOCATION }),
    bq.query({ query: candQuery(true), params: { orgId }, location: LOCATION }),
  ]);
  const jds = ((jdRes[0] ?? []) as Record<string, unknown>[]).map(mapJdRow);
  const cands = ((candRes[0] ?? []) as Record<string, unknown>[]).map(mapCandRow);
  return buildSnapshot(orgId, jds, cands, orgTargets, Date.now());
}

// ---------------------------------------------------------------------------
// Batched path (the cron) — TWO queries total for ALL orgs, grouped in memory.
// The changelog is scanned once per run regardless of org count (no N² blow-up).
// Builds a snapshot for every orgId passed in (orgs with no rows → all-zero),
// preserving the "every org gets a snapshot" behaviour.
// ---------------------------------------------------------------------------
export async function computeAllOrgSnapshots(
  orgIds: string[],
  orgTargetsByOrg: Map<string, Record<string, unknown> | null>
): Promise<KpiSnapshot[]> {
  const bq = client();
  const [jdRes, candRes] = await Promise.all([
    bq.query({ query: jdQuery(false), location: LOCATION }),
    bq.query({ query: candQuery(false), location: LOCATION }),
  ]);
  const jdsByOrg = new Map<string, JdRow[]>();
  for (const raw of (jdRes[0] ?? []) as Record<string, unknown>[]) {
    const row = mapJdRow(raw);
    if (!row.org_id) continue;
    (jdsByOrg.get(row.org_id) ?? jdsByOrg.set(row.org_id, []).get(row.org_id)!).push(row);
  }
  const candsByOrg = new Map<string, CandRow[]>();
  for (const raw of (candRes[0] ?? []) as Record<string, unknown>[]) {
    const row = mapCandRow(raw);
    if (!row.org_id) continue;
    (candsByOrg.get(row.org_id) ?? candsByOrg.set(row.org_id, []).get(row.org_id)!).push(row);
  }

  const now = Date.now();
  return orgIds.map((orgId) =>
    buildSnapshot(
      orgId,
      jdsByOrg.get(orgId) ?? [],
      candsByOrg.get(orgId) ?? [],
      orgTargetsByOrg.get(orgId) ?? null,
      now
    )
  );
}
