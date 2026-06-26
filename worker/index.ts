/**
 * EigenWork Cloud Run worker service.
 *
 * Hosts the three long-running endpoints that exceed Vercel Hobby's 60s
 * function cap. Architecture decision and rationale: see
 * docs/adr/001-vercel-cloud-run-hybrid.md.
 *
 * Endpoints:
 *   POST /worker/evaluate       async fire-and-forget eval (called by Vercel candidate route)
 *   GET  /worker/evaluate       cron safety-net (called by Cloud Scheduler)
 *   POST /match                 sync role-fit matching (called frontend-direct)
 *   POST /jd/cascade-delete     sync JD + candidates + resumes cascade delete (frontend-direct)
 *   GET  /health                Cloud Run liveness probe
 *
 * Auth model:
 *   - worker/evaluate: x-worker-secret OR Bearer CRON_SECRET (timing-safe compare)
 *   - match + cascade-delete: Firebase ID token in Authorization: Bearer header,
 *     verified with the same Admin SDK as the Vercel routes.
 *
 * Long-running notes:
 *   - Express does NOT abort handlers when the client disconnects (default
 *     behavior). The Vercel `after()` fire-and-forget may time out after 60s
 *     on the Vercel side but the Cloud Run handler keeps running to
 *     completion. That's the entire point of this service.
 *   - For the sync endpoints (match, cascade-delete), the frontend connects
 *     directly to Cloud Run (NEXT_PUBLIC_CLOUD_RUN_URL), bypassing Vercel
 *     entirely. There is no 60s wall in this path.
 */

import express, { type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import cors from "cors";
import { timingSafeEqual } from "crypto";

// Reuse the Vercel-side lib/ helpers verbatim. Same Firebase Admin SDK init,
// same logging shape, same credit ledger, same evaluation pipeline.
import {
  getAdminDb,
  getAdminAuth,
  getAdminStorage,
  adminStorageDelete,
  adminStorageDownload,
  FieldValue,
} from "@/lib/firebase-admin";
import { runEvaluation } from "@/lib/evaluation-runner";
import { computeKpiSnapshotBQ, computeAllOrgSnapshots } from "./kpi-bigquery";
import type { KpiSnapshot, KpiTrendPoint } from "@/lib/kpi/types";
import { makeOpId } from "@/lib/credit-ledger";
import { consumeEval } from "@/lib/entitlements";
import { buildEtiDistributionFromScores } from "@/lib/eti-distribution";
// ADR-010 Phase 0: match logic de-forked into lib/match.ts (was duplicated here).
// The shared core takes an injected ownership predicate; this worker keeps its
// legacy userId-scoped rule. runWithConcurrency moved to lib/concurrency.ts so
// match and cascade-delete share one copy.
import { runMatch } from "@/lib/match";
import { runWithConcurrency } from "@/lib/concurrency";
import { maybeNotifyRoleProgress } from "@/lib/agent/role-notify";
import {
  log,
  timeMs,
  type LogContext,
} from "@/lib/server-logger";

// Suppress unused warning for adminStorageDownload (referenced for parity with Vercel worker route;
// runEvaluation handles the actual download internally via its own input).
void adminStorageDownload;
void getAdminStorage;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);


// Cascade delete — bounded parallelism to avoid spiking Firestore + Storage
// at the same time. With 25 concurrent in-flight deletes a 1,000-candidate
// pipeline drains in roughly 8-12s.
const CASCADE_DELETE_PARALLELISM = 25;


// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function secretsEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isWorkerAuthorized(req: ExpressRequest): boolean {
  const workerSecret = (req.header("x-worker-secret") ?? "") as string;
  if (WORKER_SECRET && secretsEqual(workerSecret, WORKER_SECRET)) return true;
  const authHeader = (req.header("authorization") ?? "") as string;
  if (CRON_SECRET && secretsEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

/**
 * Verify a Firebase ID token from the Authorization: Bearer header.
 * Returns the userId on success, null on any failure (the caller responds 401).
 * Mirrors lib/auth-server.ts requireFirebaseUser shape.
 */
async function verifyFirebaseUser(req: ExpressRequest): Promise<string | null> {
  const header = (req.header("authorization") ?? "") as string;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return decoded?.uid ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluation worker (POST /worker/evaluate, GET /worker/evaluate for cron)
// ---------------------------------------------------------------------------

type EvalJob = {
  candidateId: string;
  jobId?: string | null;
  ownerUserId?: string | null;
  ownerOrgId?: string | null;
  resumePath?: string | null;
  githubUrl?: string | null;
  experience?: string | null;
  attempts?: number;
  status?: "queued" | "running" | "done" | "failed";
  lastError?: string | null;
};

async function claimJob(jobId?: string | null) {
  const db = getAdminDb();

  if (jobId) {
    const ref = db.collection("evaluationJobs").doc(jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: "not_found" };
      const data = snap.data() as EvalJob;
      if (data.status === "running" || data.status === "done") {
        return { ok: false as const, error: "not_claimable" };
      }
      tx.set(
        ref,
        { status: "running", startedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { ok: true as const, id: ref.id, data };
    });
  }

  // Cron / unspecified path: claim oldest queued job.
  const qs = await db
    .collection("evaluationJobs")
    .where("status", "==", "queued")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (qs.empty) return { ok: false as const, error: "none" };
  const ref = qs.docs[0].ref;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: "not_found" };
    const data = snap.data() as EvalJob;
    if (data.status !== "queued") return { ok: false as const, error: "not_claimable" };
    tx.set(ref, { status: "running", startedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true as const, id: ref.id, data };
  });
}

async function handleWorkerEvaluate(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const requestId = (req.header("x-request-id") ?? cryptoRandom()) as string;
  const route = "/worker/evaluate";

  if (!isWorkerAuthorized(req)) {
    res.status(403).json({ success: false, error: "forbidden" });
    return;
  }

  // POST may carry a jobId; GET (cron) carries none.
  const body =
    req.method === "POST" && typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};
  const requestedJobId = typeof body.jobId === "string" ? (body.jobId as string) : null;

  const claimed = await claimJob(requestedJobId);
  if (!claimed.ok) {
    res.json({ success: true, claimed: false, reason: claimed.error });
    return;
  }

  const { id: evalJobId, data } = claimed;
  const ctx: LogContext = {
    requestId,
    route,
    opId: evalJobId,
    candidateId: data.candidateId,
    jobId: data.jobId ?? undefined,
    userId: data.ownerUserId ?? undefined,
  };

  const tTotal = timeMs();
  log("info", "worker.job_claimed", ctx);

  const db = getAdminDb();
  const jobRef = db.collection("evaluationJobs").doc(evalJobId);
  const candidateRef = db.collection("candidates").doc(data.candidateId);

  try {
    const candSnap = await candidateRef.get();
    if (!candSnap.exists) {
      await jobRef.set(
        {
          status: "failed",
          lastError: "candidate_not_found",
          finishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.status(404).json({ success: false, error: "candidate_not_found" });
      return;
    }

    const resumePath = data.resumePath ?? null;
    if (!resumePath) throw new Error("missing_resume_path");

    const tDl = timeMs();
    const bytes = await adminStorageDownload(resumePath);
    log("info", "resume.download_ok", { ...ctx, latencyMs: tDl(), bytes: bytes.byteLength });

    const resumeBase64 = bytes.toString("base64");
    const result = await runEvaluation(
      { resumeBase64, githubUrl: data.githubUrl ?? null, experience: data.experience ?? ">=2" },
      ctx
    );

    // Idempotent doc write: skip if score already set (re-runs of the same job).
    const flippedToSubmitted = await db.runTransaction(async (tx) => {
      const snap = await tx.get(candidateRef);
      if (!snap.exists) return false;
      const d = snap.data() as { status?: string; score?: number } | undefined;
      const alreadyScored = typeof d?.score === "number" && Number.isFinite(d.score);
      if (alreadyScored) return false;
      tx.set(
        candidateRef,
        {
          ...result,
          status: "submitted",
          evaluatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    });

    // This submission may have pushed the role past a notify threshold (ready @60%
    // / full @cap) — DM the EigenBot installer. Best-effort, never blocks the eval.
    if (flippedToSubmitted) await maybeNotifyRoleProgress(data.jobId ?? null);

    // Screen deduction (org-scoped entitlements). Draws from the active pass
    // bucket first, then the overage wallet. See lib/entitlements.ts.
    if (data.ownerOrgId) {
      const opId = makeOpId({
        source: "screen",
        candidateId: data.candidateId,
        jobId: data.jobId ?? "",
        orgId: data.ownerOrgId,
      });
      const consumeResult = await consumeEval({
        orgId: data.ownerOrgId,
        jobId: data.jobId ?? null,
        opId,
        metadata: {
          candidateId: data.candidateId,
          jobId: data.jobId ?? null,
          evaluationJobId: evalJobId,
        },
      });
      if (!consumeResult.applied && consumeResult.reason === "no_screens") {
        log("error", "screen.no_screens_at_debit", { ...ctx, opId });
        await candidateRef.set(
          {
            creditNotDeducted: true,
            creditNotDeductedReason: "no_screens",
          },
          { merge: true }
        );
      }
    }

    await jobRef.set(
      {
        status: "done",
        finishedAt: FieldValue.serverTimestamp(),
        latencyMs: tTotal(),
      },
      { merge: true }
    );

    log("info", "worker.job_done", { ...ctx, latencyMs: tTotal() });
    res.json({ success: true, claimed: true, jobId: evalJobId, candidateId: data.candidateId });
  } catch (err) {
    const attempts = Number(data.attempts ?? 0) + 1;
    const lastError = err instanceof Error ? err.message : String(err);
    const shouldRetry = attempts < 5;
    await jobRef.set(
      {
        status: shouldRetry ? "queued" : "failed",
        attempts,
        lastError,
        finishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    log("error", "worker.job_failed", { ...ctx, attempts, retrying: shouldRetry, latencyMs: tTotal() }, err);
    res.status(500).json({ success: false, error: "job_failed", retrying: shouldRetry });
  }
}


async function handleMatch(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const requestId = (req.header("x-request-id") ?? cryptoRandom()) as string;
  const route = "/match";

  const userId = await verifyFirebaseUser(req);
  if (!userId) {
    res.status(401).json({ success: false, error: "unauthenticated" });
    return;
  }

  const body =
    typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const jobId =
    typeof body.jobId === "string"
      ? (body.jobId as string)
      : typeof body.jdId === "string"
      ? (body.jdId as string)
      : null;
  if (!jobId) {
    res.status(400).json({ success: false, error: "jobId required" });
    return;
  }

  const ctx: LogContext = { requestId, route, userId, jobId };
  try {
    // Worker keeps the legacy userId-scoped ownership rule (see lib/match.ts note).
    const result = await runMatch(jobId, ctx, (jd) => typeof jd.userId === "string" && jd.userId === userId);
    if (!result.success && result.error) {
      const status = result.error === "Job not found" ? 404 : result.error === "Forbidden" ? 403 : 400;
      res.status(status).json({ success: false, error: result.error });
      return;
    }
    res.json({
      success: true,
      top20: result.top20 ?? [],
      etiDistribution: result.etiDistribution ?? buildEtiDistributionFromScores([]),
      seniority: result.seniority ?? "",
    });
  } catch (err) {
    log("error", "match.failed", ctx, err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------------------------------------------------------------------------
// JD cascade delete (POST /jd/cascade-delete)
// ---------------------------------------------------------------------------

async function handleCascadeDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const requestId = (req.header("x-request-id") ?? cryptoRandom()) as string;
  const route = "/jd/cascade-delete";

  const userId = await verifyFirebaseUser(req);
  if (!userId) {
    res.status(401).json({ success: false, error: "unauthenticated" });
    return;
  }

  const body =
    typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const jobId = typeof body.jobId === "string" ? (body.jobId as string) : null;
  if (!jobId) {
    res.status(400).json({ success: false, error: "jobId required" });
    return;
  }

  const ctx: LogContext = { requestId, route, userId, jobId };
  const tRun = timeMs();

  try {
    const db = getAdminDb();
    const jobSnap = await db.collection("jds").doc(jobId).get();
    if (!jobSnap.exists) {
      res.status(404).json({ success: false, error: "Job not found" });
      return;
    }
    const owner = jobSnap.data()?.userId;
    if (!owner || owner !== userId) {
      res.status(403).json({ success: false, error: "forbidden" });
      return;
    }

    const candSnap = await db.collection("candidates").where("matchData.jobId", "==", jobId).get();
    log("info", "jd.cascade_delete_start", { ...ctx, candidates: candSnap.size });

    // Parallel delete with bounded concurrency: avoids spiking Storage + Firestore
    // simultaneously at extreme scale, while still ~25x faster than sequential.
    const deletions = candSnap.docs.map((d) => async () => {
      const candidateId = d.id;
      try {
        await adminStorageDelete(`resumes/${candidateId}.pdf`);
      } catch (storageErr) {
        log("warn", "jd.cascade_storage_delete_skipped", { ...ctx, candidateId }, storageErr);
      }
      await db.collection("candidates").doc(candidateId).delete();
    });

    // Settle-with-concurrency over the deletion tasks.
    await runWithConcurrency(deletions, CASCADE_DELETE_PARALLELISM, async (task) => task());

    await db.collection("jds").doc(jobId).delete();

    log("info", "jd.cascade_delete_done", { ...ctx, deleted: candSnap.size, latencyMs: tRun() });
    res.json({ success: true, deleted: candSnap.size });
  } catch (err) {
    log("error", "jd.cascade_delete_failed", ctx, err);
    res.status(500).json({ success: false, error: "Failed to delete pipeline" });
  }
}

// ---------------------------------------------------------------------------
// KPI aggregation (ADR-009) — cron-driven BigQuery-backed snapshot writer.
// Cloud Scheduler hits this per the schedule; for each org it runs the 7 KPIs
// over the BigQuery latest-state views (computeKpiSnapshotBQ) and caches them at
// kpi_snapshots/{orgId} so the dashboard reads ONE doc. Firestore reads here are
// just the org list + each org's org_targets (BigQuery isn't billed for those).
// ---------------------------------------------------------------------------

async function handleKpiAggregate(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const requestId = (req.header("x-request-id") ?? cryptoRandom()) as string;
  const route = "/worker/kpi-aggregate";

  if (!isWorkerAuthorized(req)) {
    res.status(403).json({ success: false, error: "forbidden" });
    return;
  }

  const ctx: LogContext = { requestId, route };
  const tTotal = timeMs();
  const db = getAdminDb();

  try {
    // Single-org mode (?orgId=) for targeted recompute, else all orgs.
    const orgIdParam =
      typeof req.query.orgId === "string" && req.query.orgId.length > 0
        ? (req.query.orgId as string)
        : (typeof req.body === "object" && req.body !== null && typeof (req.body as Record<string, unknown>).orgId === "string"
            ? ((req.body as Record<string, unknown>).orgId as string)
            : null);

    const orgIds: string[] = orgIdParam
      ? [orgIdParam]
      : (await db.collection("orgs").get()).docs.map((d) => d.id);

    // org_targets isn't mirrored to BigQuery — read each org's targets doc from
    // Firestore (tiny) and pass the map into the aggregator.
    const orgTargetsByOrg = new Map<string, Record<string, unknown> | null>();
    await Promise.all(
      orgIds.map(async (id) => {
        const t = await db.collection("org_targets").doc(id).get();
        orgTargetsByOrg.set(id, t.exists ? (t.data() as Record<string, unknown>) : null);
      })
    );

    // BATCHED: two BigQuery queries total for ALL orgs (the changelog is scanned
    // once per run, grouped by org in memory) — avoids the per-org N² scan.
    const snapshots: KpiSnapshot[] = orgIdParam
      ? [await computeKpiSnapshotBQ(orgIdParam, orgTargetsByOrg.get(orgIdParam) ?? null)]
      : await computeAllOrgSnapshots(orgIds, orgTargetsByOrg);

    const MAX_HISTORY = 24; // rolling trend window for the headline sparklines.
    let processed = 0;
    let failed = 0;
    for (const snapshot of snapshots) {
      try {
        // Append this run's headline values to the org's rolling trend history
        // (read the previous snapshot's history, append, cap). One tiny extra
        // read per org; this is the time-series the dashboard sparklines draw.
        const prev = await db.collection("kpi_snapshots").doc(snapshot.orgId).get();
        const prevHistory = Array.isArray(prev.data()?.history)
          ? (prev.data()!.history as KpiTrendPoint[])
          : [];
        const point: KpiTrendPoint = {
          at: snapshot.computedAt,
          timeToFill: snapshot.timeToFill.medianDays,
          offerRate: snapshot.offerAcceptance.rate,
        };
        snapshot.history = [...prevHistory, point].slice(-MAX_HISTORY);
        await db.collection("kpi_snapshots").doc(snapshot.orgId).set(snapshot);
        processed += 1;
      } catch (err) {
        failed += 1;
        // One org's write failure must not abort the rest.
        log("error", "kpi.org_write_failed", { ...ctx, orgId: snapshot.orgId }, err);
      }
    }

    log("info", "kpi.aggregate_done", { ...ctx, orgs: orgIds.length, processed, failed, ms: tTotal() });
    res.json({ success: true, processed, ...(failed > 0 && { failed }) });
  } catch (err) {
    log("error", "kpi.aggregate_failed", ctx, err);
    res.status(500).json({ success: false, error: "kpi_aggregate_failed" });
  }
}

// ---------------------------------------------------------------------------
// Express bootstrap
// ---------------------------------------------------------------------------

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const app = express();

app.use(express.json({ limit: "1mb" }));

// CORS only for the frontend-direct endpoints.
const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // Allow requests with no Origin (curl, health probes, server-to-server).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
};

app.use("/match", cors(corsOptions));
app.use("/jd/cascade-delete", cors(corsOptions));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/worker/evaluate", (req, res) => {
  void handleWorkerEvaluate(req, res);
});
app.get("/worker/evaluate", (req, res) => {
  void handleWorkerEvaluate(req, res);
});

// ADR-009 KPI snapshot cron. POST (manual / single-org) + GET (Cloud Scheduler).
app.post("/worker/kpi-aggregate", (req, res) => {
  void handleKpiAggregate(req, res);
});
app.get("/worker/kpi-aggregate", (req, res) => {
  void handleKpiAggregate(req, res);
});

app.post("/match", (req, res) => {
  void handleMatch(req, res);
});
app.post("/jd/cascade-delete", (req, res) => {
  void handleCascadeDelete(req, res);
});

const PORT = parseInt(process.env.PORT ?? "8080", 10);
app.listen(PORT, () => {
  // Plain console.log here (not the structured logger) so Cloud Run sees the
  // standard stdout line and the container is marked as serving immediately.
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker.listening", port: PORT }));
});
