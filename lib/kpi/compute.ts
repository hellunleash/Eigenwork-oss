// ---------------------------------------------------------------------------
// lib/kpi/compute.ts — Firestore-direct KPI aggregation (ADR-009)
// ---------------------------------------------------------------------------
// computeKpiSnapshot() reads an org's jds + their candidates straight from
// Firestore and computes the 7 ADR-009 KPIs into the kpi_snapshots/{orgId}
// contract (lib/kpi/types.ts). The founder chose Firestore-direct over
// BigQuery; the cron (worker /worker/kpi-aggregate) calls this per org and
// caches the result so the dashboard reads ONE doc.
//
// DEGRADATION RULE (load-bearing): several KPIs depend on fields other ADR-009
// units backfill (candidates.shortlistRank / selectedForInterview /
// interviewOutcome / offer*At / hiredAt / matchData.source; jds.hiredAt;
// org_targets). When a field is absent this code returns null / 0 / [] for the
// affected KPI — it NEVER throws. A partially-backfilled org still gets a valid
// snapshot; the dashboard tiles for not-yet-wired KPIs simply show empty.

import type { Funnel, KpiSnapshot, KpiSource } from "@/lib/kpi/types";

// Firestore Timestamp | epoch-ms number | {_seconds}/{seconds} → epoch ms (or
// null). Copied verbatim from app/api/jd/[jobId]/interviews/route.ts so the
// cron and the interview route agree on Timestamp coercion.
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

const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_TO_FILL_MIN_HIRES = 3; // below this, time-to-fill is not a trend.
const OFFER_INFLIGHT_DAYS = 14; // offers younger than this are still in-flight.

type Doc = Record<string, unknown>;

// --- small pure helpers -----------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

// Current quarter label from a Date, e.g. "2026-Q3".
function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

// [startMs, endMs) for the calendar quarter containing `d`.
function quarterBounds(d: Date): { start: number; end: number } {
  const q = Math.floor(d.getMonth() / 3);
  const start = new Date(d.getFullYear(), q * 3, 1).getTime();
  const end = new Date(d.getFullYear(), q * 3 + 3, 1).getTime();
  return { start, end };
}

// [startMs, endMs) for the calendar month containing `d`.
function monthBounds(d: Date): { start: number; end: number } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { start, end };
}

// Robust overlord read: prefer the structured verdict enum, fall back to a raw
// numeric fraud_risk (>=0.4 == flagged, mirroring the cap thresholds in
// lib/evaluation-runner.ts). Returns true when the candidate is flagged as
// suspicious OR inflated. Never throws on a malformed shape.
function isInflatedOrSuspicious(cand: Doc): boolean {
  const ov = cand.overlord_verdict;
  if (!ov || typeof ov !== "object") return false;
  const o = ov as Record<string, unknown>;
  const verdict = o.verdict;
  if (verdict === "suspicious" || verdict === "inflated") return true;
  const fr = num(o.fraud_risk);
  // Numeric fallback for docs that carry fraud_risk but a missing/"safe" word.
  return fr != null && fr >= 0.4;
}

// Read each jd's shortlist array. Unit 4 renames matchResult.top10 ->
// matchResult.top20 (up to 20 entries); fall back to the legacy top10 so we
// degrade rather than break on a jd that predates the rename.
function shortlistOf(jd: Doc): Doc[] {
  const mr = jd.matchResult as { top20?: unknown; top10?: unknown } | undefined;
  const arr = mr?.top20 ?? mr?.top10 ?? [];
  return Array.isArray(arr) ? (arr.filter((e) => !!e && typeof e === "object") as Doc[]) : [];
}

// Build a Funnel over a candidate subset (selected -> cleared).
function funnelOf(cands: Doc[]): Funnel {
  let selected = 0;
  let cleared = 0;
  for (const c of cands) {
    if (c.selectedForInterview === true) selected += 1;
    if (c.interviewOutcome === "cleared") cleared += 1;
  }
  return { selected, cleared, rate: rateOrNull(cleared, selected) };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function computeKpiSnapshot(
  db: FirebaseFirestore.Firestore,
  orgId: string
): Promise<KpiSnapshot> {
  const now = Date.now();
  const nowDate = new Date(now);
  const windowStart = now - WINDOW_DAYS * DAY_MS;
  const quarter = quarterBounds(nowDate);
  const month = monthBounds(nowDate);

  // --- read jds for the org -------------------------------------------------
  const jdsSnap = await db.collection("jds").where("orgId", "==", orgId).get();
  const jds = jdsSnap.docs.map((d) => ({ id: d.id, data: d.data() as Doc }));

  // --- read candidates per jd (joined by matchData.jobId) -------------------
  // shortlistById: each jd's frozen shortlist entry by candidate id, carrying
  // the persisted shortlistRank (Unit 4 backfills it; fallback = index+1).
  type JdBundle = {
    id: string;
    data: Doc;
    candidates: Doc[];
    shortlist: Array<{ id: string; rank: number }>;
  };
  const bundles: JdBundle[] = await Promise.all(
    jds.map(async ({ id, data }) => {
      const candSnap = await db
        .collection("candidates")
        .where("matchData.jobId", "==", id)
        .get();
      // Spread first, then the doc id last so a stray `id` field on the doc can
      // never clobber the canonical Firestore document id (used as the join key).
      const candidates = candSnap.docs.map((c) => ({ ...(c.data() as Doc), id: c.id }));
      const shortlist = shortlistOf(data).map((entry, i) => {
        const eid = str(entry.id) ?? "";
        const rank = num(entry.shortlistRank) ?? i + 1;
        return { id: eid, rank };
      });
      return { id, data, candidates, shortlist };
    })
  );

  const allCandidates: Doc[] = bundles.flatMap((b) => b.candidates);
  const candById = new Map<string, Doc>();
  for (const c of allCandidates) {
    const cid = str(c.id);
    if (cid) candById.set(cid, c);
  }

  // ========================================================================
  // #1 Time-to-fill — median(hiredAt − createdAt) over jds hired in window.
  // ========================================================================
  const fillDays: number[] = [];
  for (const { data } of jds) {
    const hiredAt = tsToMs(data.hiredAt);
    const createdAt = tsToMs(data.createdAt);
    if (hiredAt == null || createdAt == null) continue; // jds.hiredAt unbackfilled → skip.
    if (hiredAt < windowStart) continue; // hired outside the window.
    if (hiredAt < createdAt) continue; // guard against bad data.
    fillDays.push((hiredAt - createdAt) / DAY_MS);
  }
  const ttfHires = fillDays.length;
  const ttfBelow = ttfHires < TIME_TO_FILL_MIN_HIRES;
  const timeToFill = {
    medianDays: ttfBelow ? null : median(fillDays),
    hires: ttfHires,
    belowThreshold: ttfBelow,
  };

  // ========================================================================
  // #2 Roles filled vs target — jds hired this quarter / org_targets[period].
  // ========================================================================
  const period = quarterLabel(nowDate);
  let rolesHiredThisQuarter = 0;
  for (const { data } of jds) {
    const hiredAt = tsToMs(data.hiredAt);
    if (hiredAt != null && hiredAt >= quarter.start && hiredAt < quarter.end) {
      rolesHiredThisQuarter += 1;
    }
  }
  let target: number | null = null;
  try {
    const targetsSnap = await db.collection("org_targets").doc(orgId).get();
    const targets = targetsSnap.data() as Doc | undefined;
    target = num(targets?.[period]);
  } catch {
    target = null; // org_targets absent / unreadable → no target (degrade).
  }
  const rolesFilled = { hired: rolesHiredThisQuarter, target };

  // ========================================================================
  // #3 Offer acceptance — accepted / offers extended > 14 days ago.
  // ========================================================================
  let offersAccepted = 0;
  let offersExtended = 0;
  const inflightCutoff = now - OFFER_INFLIGHT_DAYS * DAY_MS;
  for (const c of allCandidates) {
    if (tsToMs(c.offerAcceptedAt) != null) offersAccepted += 1;
    const extendedAt = tsToMs(c.offerExtendedAt);
    // Exclude offers still in-flight (extended < 14 days ago) from denominator.
    if (extendedAt != null && extendedAt <= inflightCutoff) offersExtended += 1;
  }
  const offerAcceptance = {
    accepted: offersAccepted,
    extended: offersExtended,
    rate: rateOrNull(offersAccepted, offersExtended),
  };

  // ========================================================================
  // #4 Inflated profiles surfaced — flagged candidates THIS CALENDAR MONTH.
  //    Ships today (overlord_verdict already persisted) — zero new fields.
  // ========================================================================
  let inflatedCount = 0;
  for (const c of allCandidates) {
    const submittedAt = tsToMs(c.timestamp) ?? tsToMs(c.createdAt);
    if (submittedAt == null || submittedAt < month.start || submittedAt >= month.end) continue;
    if (isInflatedOrSuspicious(c)) inflatedCount += 1;
  }
  const inflatedProfiles = { count: inflatedCount };

  // ========================================================================
  // #5 Open reqs · pipeline by stage — stage counts across OPEN reqs.
  // ========================================================================
  const stageCounts = {
    screening: 0,
    interviewing: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  };
  let openReqs = 0;
  for (const b of bundles) {
    if (b.data.isClosed === true) continue; // only OPEN reqs.
    openReqs += 1;
    for (const c of b.candidates) {
      const stage = (str(c.stage) ?? "screening") as keyof typeof stageCounts;
      if (stage in stageCounts) stageCounts[stage] += 1;
      else stageCounts.screening += 1; // unknown stage value → screening default.
    }
  }
  const pipelineByStage = { ...stageCounts, openReqs };

  // ========================================================================
  // #6 Shortlist quality — clear rate at depth, across all jds' shortlists.
  //    Funnel uses the LIVE candidate doc (selectedForInterview /
  //    interviewOutcome get backfilled there), keyed by frozen rank.
  // ========================================================================
  const top10Cands: Doc[] = [];
  const top20Cands: Doc[] = [];
  const ranks11to20Cands: Doc[] = [];
  for (const b of bundles) {
    for (const entry of b.shortlist) {
      const cand = candById.get(entry.id);
      if (!cand) continue;
      const rank = entry.rank;
      if (rank >= 1 && rank <= 20) top20Cands.push(cand);
      if (rank >= 1 && rank <= 10) top10Cands.push(cand);
      if (rank >= 11 && rank <= 20) ranks11to20Cands.push(cand);
    }
  }
  const shortlistQuality = {
    top10: funnelOf(top10Cands),
    top20: funnelOf(top20Cands),
    ranks11to20: funnelOf(ranks11to20Cands),
  };

  // ========================================================================
  // #7 Channel strength — same funnel grouped by matchData.source.
  // ========================================================================
  // Pre-index each candidate's frozen shortlistRank (from the shortlist arrays)
  // so top-10 penetration is rank-controlled even when the candidate doc itself
  // lacks shortlistRank.
  const rankById = new Map<string, number>();
  for (const b of bundles) {
    for (const entry of b.shortlist) {
      if (entry.id) rankById.set(entry.id, entry.rank);
    }
  }
  type Agg = { submissions: number; top10: number; selected: number; cleared: number; hires: number };
  const bySource = new Map<string, Agg>();
  for (const c of allCandidates) {
    const matchData = c.matchData as Doc | undefined;
    const name = str(matchData?.source) ?? "Unknown";
    let agg = bySource.get(name);
    if (!agg) {
      agg = { submissions: 0, top10: 0, selected: 0, cleared: 0, hires: 0 };
      bySource.set(name, agg);
    }
    agg.submissions += 1;
    const cid = str(c.id);
    const rank = cid ? rankById.get(cid) ?? num(c.shortlistRank) : num(c.shortlistRank);
    if (rank != null && rank <= 10) agg.top10 += 1;
    if (c.selectedForInterview === true) agg.selected += 1;
    if (c.interviewOutcome === "cleared") agg.cleared += 1;
    if (tsToMs(c.hiredAt) != null) agg.hires += 1;
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
  };
}
