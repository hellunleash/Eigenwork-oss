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
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

// Reuse the Vercel-side lib/ helpers verbatim. Same Firebase Admin SDK init,
// same logging shape, same credit ledger, same evaluation pipeline.
import {
  getAdminDb,
  getAdminAuth,
  getAdminStorage,
  freshResumeUrl,
  adminStorageDelete,
  adminStorageDownload,
  FieldValue,
} from "@/lib/firebase-admin";
import { runEvaluation } from "@/lib/evaluation-runner";
import { computeKpiSnapshotBQ, computeAllOrgSnapshots } from "./kpi-bigquery";
import type { KpiSnapshot, KpiTrendPoint } from "@/lib/kpi/types";
import { makeOpId } from "@/lib/credit-ledger";
import { consumeEval } from "@/lib/entitlements";
import {
  getRoleFitCachedLabelsBatch,
  setRoleFitCachedLabelsBatch,
} from "@/lib/rolefit-cache";
import {
  buildEtiDistributionFromScores,
  type EtiDistribution,
} from "@/lib/eti-distribution";
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

// Match-engine constants — mirrors app/api/jd/match/route.ts.
const CHUNK_SIZE = 200;
const MAX_PARALLELISM = 10;
const PER_CHUNK_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
// Gemini 2.5 Flash uses tokens from this budget for internal "thinking" before
// producing the visible answer. With dynamic thinking enabled, a small budget
// (e.g. 112 tokens for 1 candidate) gets entirely consumed by reasoning, and
// the model returns only the first few chars of the answer ("1 → AD" instead
// of "1 → ADJACENT"). We explicitly disable thinking AND keep a generous
// per-call floor so truncation cannot happen.
const OUTPUT_TOKENS_PER_CANDIDATE = 20;
const OUTPUT_TOKENS_BUFFER = 200;
const OUTPUT_TOKENS_FLOOR = 512;

// Cascade delete — bounded parallelism to avoid spiking Firestore + Storage
// at the same time. With 25 concurrent in-flight deletes a 1,000-candidate
// pipeline drains in roughly 8-12s.
const CASCADE_DELETE_PARALLELISM = 25;

// Number of candidates returned in the /match response. Tune in product flow.
// ADR-009 #6 (shortlist-quality) needs depth past 10 — the recruiter must see
// ranks 11-20 to measure top-10 vs top-20 clear rate — so this is 20.
// Lazy enrichment downstream scales automatically up to ~50 (the per-candidate
// Firestore point read is in a Promise.all over this slice). Above ~50, wrap
// the enrichment loop in runWithConcurrency(top, 25, ...) to cap simultaneous
// reads. The JSON response key is `top20` (ADR-009 rename from `top10`).
// Must match the value in app/api/jd/match/route.ts so Cloud Run + Vercel agree.
const TOP_MATCH_COUNT = 20;

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
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(candidateRef);
      if (!snap.exists) return;
      const d = snap.data() as { status?: string; score?: number } | undefined;
      const alreadyScored = typeof d?.score === "number" && Number.isFinite(d.score);
      if (alreadyScored) return;
      tx.set(
        candidateRef,
        {
          ...result,
          status: "submitted",
          evaluatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

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

// ---------------------------------------------------------------------------
// Match (POST /match)  — mirrors app/api/jd/match/route.ts runMatch()
// ---------------------------------------------------------------------------

const ROLE_FIT_PROMPT = `
You are a senior hiring-matching assistant.

You will receive:

JD:
<jd one-liner>

Candidates:
1. <candidate one-liner>
2. <candidate one-liner>
3. <candidate one-liner>
...

Each one-liner is EXACTLY in the format:
"<Title> (Primary | Secondary | Tertiary)"

INTERPRETATION RULES:
- PRIMARY decides the overall functional match.
- SECONDARY can increase confidence but MUST NEVER be the reason for rejection.
- TERTIARY is mostly ignorable and MUST NEVER cause a mismatch.

ROLE-FIT DECISION HIERARCHY (PRIMARY-DRIVEN):
- PRIMARY is the main signal for MATCH vs ADJACENT vs NO MATCH.
- Titles can be fuzzy (e.g., "Backend", "Backend Engineer", "Backend Developer" , or just "Software Engineer" are equivalent).
- Minor wording differences or synonyms MUST NOT cause "NO MATCH".

DOMAIN FAMILIES:
- Treat ML / AI / LLM / NLP / Computer Vision / Data / MLOps as one adjacent family.
  - If JD and candidate are both anywhere in this family, classify at worst as ADJACENT (never NO MATCH for domain only).

HARD NO MATCH CASES (when PRIMARY clearly conflicts and JD primary does NOT list both):
- .NET backend vs Python backend (if the JD primary is only one of them, not both).
- Frontend-only vs ML/Data roles.
- Mobile-only vs ML/Data roles.
- Swift-only vs a JD that explicitly requires both Android and iOS (or vice versa).

CLASSIFICATION LABELS (PER CANDIDATE):
- MATCH: Strong primary alignment with the JD role and tech focus.
- ADJACENT: Reasonably close primary alignment or same domain family; candidate could succeed with minor ramp-up.
- NO MATCH: Fundamental primary role/domain/stack mismatch (do NOT use secondary/tertiary to force a match).

OUTPUT FORMAT:
- For each candidate N, output EXACTLY ONE line:
  "N → MATCH" or "N → ADJACENT" or "N → NO MATCH"
- Use plain text only, no extra commentary, no Markdown, no bullet points.
`;

type RoleFitLabel = "MATCH" | "ADJACENT" | "NO MATCH";

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeLocation(s: string): string {
  const t = (s || "").trim().toLowerCase();
  if (t === "on-site" || t === "onsite") return "onsite";
  if (t === "remote") return "remote";
  if (t === "hybrid") return "hybrid";
  return (s || "").trim().toLowerCase();
}

function getJDRoleFitOneLiner(jd: Record<string, unknown>): string {
  const rf = jd.role_fit;
  if (rf != null && typeof rf === "object" && "one_liner" in rf) {
    return String((rf as Record<string, unknown>).one_liner ?? "").trim();
  }
  if (typeof (jd as Record<string, unknown>).role_fit_one_liner === "string") {
    return String((jd as Record<string, unknown>).role_fit_one_liner).trim();
  }
  return "";
}

function getCandidateRoleFitOneLiner(candidate: { profile?: { role_fit?: unknown } }): string {
  const rf = candidate.profile?.role_fit;
  if (typeof rf === "string") return String(rf).trim();
  if (rf != null && typeof rf === "object" && "one_liner" in rf) {
    return String((rf as Record<string, unknown>).one_liner ?? "").trim();
  }
  return "";
}

function workAuthMatch(
  jobAuth: { us_required?: boolean; eu_required?: boolean; provided?: boolean },
  jobLocationTypes: string[],
  candidateAuthRegions: string[] | undefined
): boolean {
  if (jobAuth?.provided) return true;
  const regions = toArray(candidateAuthRegions).map((r) => String(r).toLowerCase());
  // No stored work-auth regions (legacy candidates from before authRegions was
  // persisted, or any data gap): don't silently reject — pass and let the
  // recruiter judge. New submissions always carry authRegions (the intake form
  // requires at least one), so they're still filtered strictly below.
  if (regions.length === 0) return true;
  const hasRemoteGlobal = regions.some((r) => r.includes("remote") && r.includes("global"));
  if (hasRemoteGlobal) {
    const job = jobLocationTypes.map(normalizeLocation);
    if (!job.includes("remote")) return false;
  }
  if (jobAuth?.us_required && !regions.some((r) => r.includes("us"))) return false;
  if (jobAuth?.eu_required && !regions.some((r) => r.includes("eu"))) return false;
  return true;
}

async function runWithConcurrency<T, R>(
  items: T[],
  parallelism: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i], i);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  const lanes = Math.max(1, Math.min(parallelism, items.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}

async function classifyChunkWithGemini(
  model: GenerativeModel,
  jdRoleFit: string,
  chunkLines: string[],
  chunkIndex: number,
  ctx: LogContext
): Promise<RoleFitLabel[]> {
  // Use the larger of (per-candidate budget) and (floor). The floor protects
  // small chunks (e.g. 1 candidate) from being starved when Gemini 2.5 Flash
  // tries to "think" before producing the answer.
  const expectedOutputTokens = Math.max(
    OUTPUT_TOKENS_FLOOR,
    chunkLines.length * OUTPUT_TOKENS_PER_CANDIDATE + OUTPUT_TOKENS_BUFFER
  );

  let prompt = `${ROLE_FIT_PROMPT}\n\nJD:\n${jdRoleFit}\n\nCandidates:\n`;
  chunkLines.forEach((line, idx) => {
    prompt += `${idx + 1}. ${line}\n`;
  });

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t = timeMs();
    try {
      const generatePromise = model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // Gemini 2.5 Flash supports a `thinkingConfig` that controls how many
        // tokens the model spends on internal reasoning before producing the
        // visible answer. For our deterministic "classify N candidates into
        // MATCH/ADJACENT/NO MATCH" task no reasoning is needed; we set the
        // budget to 0 so all output tokens go to the visible response. The
        // SDK passes unknown keys through to the API.
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
          maxOutputTokens: expectedOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        } as unknown as Record<string, unknown>,
      });
      const result = await Promise.race([
        generatePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("gemini_timeout")), PER_CHUNK_TIMEOUT_MS)
        ),
      ]);

      const raw = result.response.text() ?? "";
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      const labels: RoleFitLabel[] = new Array(chunkLines.length).fill("NO MATCH");
      let parsed = 0;
      for (const line of lines) {
        const m = line.match(/^(\d+)\s*→\s*(MATCH|ADJACENT|NO MATCH)/i);
        if (!m) continue;
        const idx = Number(m[1]) - 1;
        if (idx < 0 || idx >= chunkLines.length) continue;
        labels[idx] = m[2].toUpperCase() as RoleFitLabel;
        parsed++;
      }

      if (parsed < Math.ceil(chunkLines.length * 0.8)) {
        // Light diagnostic on parse failure — enough to debug without dumping
        // the full prompt or full Gemini response in normal operation.
        log("warn", "match.rolefit_chunk_parse_short", {
          ...ctx,
          chunkIndex,
          chunkSize: chunkLines.length,
          parsed,
          rawLen: raw.length,
          rawPreview: raw.slice(0, 200),
        });
        throw new Error(`gemini_parse_short: parsed ${parsed} of ${chunkLines.length}`);
      }

      log("info", "match.rolefit_chunk_ok", {
        ...ctx,
        chunkIndex,
        chunkSize: chunkLines.length,
        parsed,
        attempt,
        latencyMs: t(),
      });
      return labels;
    } catch (err) {
      lastError = err;
      const isLast = attempt === MAX_RETRIES;
      log("warn", "match.rolefit_chunk_attempt_failed", {
        ...ctx,
        chunkIndex,
        chunkSize: chunkLines.length,
        attempt,
        retrying: !isLast,
        latencyMs: t(),
      }, err);
      if (!isLast) {
        await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      }
    }
  }

  log("error", "match.rolefit_chunk_failed", {
    ...ctx,
    chunkIndex,
    chunkSize: chunkLines.length,
    attempts: MAX_RETRIES + 1,
  }, lastError);
  throw lastError instanceof Error ? lastError : new Error("rolefit_chunk_failed");
}

async function geminiBatchMatch(
  jdRoleFit: string,
  candidateOneLiners: string[],
  ctx: LogContext
): Promise<string[]> {
  if (!jdRoleFit) {
    return candidateOneLiners.map(() => "MATCH");
  }

  const tTotal = timeMs();
  const N = candidateOneLiners.length;
  const results: (RoleFitLabel | undefined)[] = new Array(N);

  const g = globalThis as unknown as { __roleFitHotCache?: Map<string, RoleFitLabel> };
  const hotCache: Map<string, RoleFitLabel> =
    g.__roleFitHotCache ?? (g.__roleFitHotCache = new Map<string, RoleFitLabel>());

  const needsDurable: { idx: number; key: string; line: string }[] = [];
  let hotHits = 0;

  for (let i = 0; i < N; i++) {
    const line = (candidateOneLiners[i] || "").trim();
    if (!line) {
      results[i] = "NO MATCH";
      continue;
    }
    const key = `${jdRoleFit}::${line}`;
    const hot = hotCache.get(key);
    if (hot) {
      results[i] = hot;
      hotHits++;
      continue;
    }
    needsDurable.push({ idx: i, key, line });
  }

  const needsLlm: { idx: number; key: string; line: string }[] = [];
  let durableHits = 0;

  if (needsDurable.length > 0) {
    const tDur = timeMs();
    const labels = await getRoleFitCachedLabelsBatch(needsDurable.map((n) => n.key));
    log("info", "match.rolefit_durable_lookup", {
      ...ctx,
      keys: needsDurable.length,
      latencyMs: tDur(),
    });
    for (let j = 0; j < needsDurable.length; j++) {
      const item = needsDurable[j];
      const label = labels[j];
      if (label === "MATCH" || label === "ADJACENT" || label === "NO MATCH") {
        hotCache.set(item.key, label);
        results[item.idx] = label;
        durableHits++;
      } else {
        needsLlm.push(item);
      }
    }
  }

  if (needsLlm.length === 0) {
    log("info", "match.rolefit_batch_done", {
      ...ctx,
      candidates: N,
      hotHits,
      durableHits,
      llmCalls: 0,
      chunks: 0,
      latencyMs: tTotal(),
    });
    return results.map((r) => r ?? "NO MATCH");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0, topK: 1, topP: 1 },
  });

  const chunks: { idx: number; key: string; line: string }[][] = [];
  for (let i = 0; i < needsLlm.length; i += CHUNK_SIZE) {
    chunks.push(needsLlm.slice(i, i + CHUNK_SIZE));
  }

  log("info", "match.rolefit_llm_start", {
    ...ctx,
    candidates: N,
    hotHits,
    durableHits,
    needsLlm: needsLlm.length,
    chunks: chunks.length,
    chunkSize: CHUNK_SIZE,
    parallelism: MAX_PARALLELISM,
  });

  const settled = await runWithConcurrency(chunks, MAX_PARALLELISM, async (chunk, chunkIdx) => {
    const lines = chunk.map((c) => c.line);
    const labels = await classifyChunkWithGemini(model, jdRoleFit, lines, chunkIdx, ctx);
    const writeEntries: { key: string; label: string }[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const { idx, key } = chunk[i];
      const label = labels[i];
      results[idx] = label;
      hotCache.set(key, label);
      writeEntries.push({ key, label });
    }
    setRoleFitCachedLabelsBatch(writeEntries).catch((err) => {
      log("warn", "match.rolefit_cache_write_failed", { ...ctx, chunkIndex: chunkIdx, entries: writeEntries.length }, err);
    });
  });

  const failedChunks = settled.filter((s) => s.status === "rejected").length;
  if (failedChunks > 0) {
    log("error", "match.rolefit_batch_failed", {
      ...ctx,
      candidates: N,
      chunks: chunks.length,
      failedChunks,
      latencyMs: tTotal(),
    });
    throw new Error(`rolefit_match_failed: ${failedChunks}/${chunks.length} chunks failed`);
  }

  log("info", "match.rolefit_batch_done", {
    ...ctx,
    candidates: N,
    hotHits,
    durableHits,
    llmCalls: chunks.length,
    chunks: chunks.length,
    latencyMs: tTotal(),
  });

  return results.map((r) => r ?? "NO MATCH");
}

type CandidateDoc = {
  id: string;
  score?: number;
  yoe?: number;
  is_matchable?: boolean;
  profile?: { role_fit?: unknown; [k: string]: unknown };
  matchData?: {
    jobId?: string;
    workTypes?: string[] | string;
    locations?: string[] | string;
    authRegions?: string[] | string;
  };
  candidateName?: string;
  email?: string;
  resumePath?: string;
  experienceLevel?: string;
  breakdown?: unknown;
  [k: string]: unknown;
};

async function runMatch(
  jdId: string,
  requesterUserId: string,
  ctx: LogContext
): Promise<{ success: boolean; top20?: unknown[]; etiDistribution?: EtiDistribution; seniority?: string; error?: string }> {
  const tRun = timeMs();
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jdId).get();
  if (!snap.exists) return { success: false, error: "Job not found" };
  const jd = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  const owner = typeof jd.userId === "string" ? jd.userId : null;
  if (!owner || owner !== requesterUserId) return { success: false, error: "Forbidden" };

  // Cached-path read shape matches Vercel runMatch (including fresh resume URL regeneration).
  // ADR-009: the persisted field + response property are `top20` (renamed from
  // `top10`). Legacy docs that still hold `matchResult.top10` simply miss this
  // cached-path lookup and self-heal on the next fresh match run — no back-compat.
  const cached = jd.matchResult as { top20?: unknown[] } | undefined;
  if (cached?.top20 && Array.isArray(cached.top20)) {
    const poolSnap = await db.collection("candidates").where("matchData.jobId", "==", jdId).get();
    const etiDistribution = buildEtiDistributionFromScores(
      poolSnap.docs.map((d) => Number((d.data() as CandidateDoc).score) || 0)
    );
    const enriched = await Promise.all(
      (cached.top20 as { id: string; candidateName?: string; email?: string; yoe?: number; shortlistRank?: number }[]).map(async (item, i) => {
        // shortlistRank reflects the rank order (index+1). Prefer the value
        // persisted on the JD doc, falling back to position for legacy caches.
        const shortlistRank = typeof item.shortlistRank === "number" ? item.shortlistRank : i + 1;
        try {
          const candSnap = await db.collection("candidates").doc(item.id).get();
          if (!candSnap.exists) return { ...item, shortlistRank };
          const d = candSnap.data();
          const source = (d?.matchData as { source?: unknown } | undefined)?.source;
          const resumePath = typeof d?.resumePath === "string" ? d.resumePath : null;
          const resumeUrl = await freshResumeUrl(resumePath);
          return {
            ...item,
            candidateName: d?.candidateName ?? item.candidateName ?? "",
            email: d?.email ?? item.email ?? "",
            yoe: d?.yoe ?? item.yoe,
            resume_url: resumeUrl,
            // ADR-009: rank-stratification + source attribution for the
            // shortlist-quality / channel-strength funnels. Conditional spread
            // on source so missing values never write/serialize undefined.
            shortlistRank,
            ...(source != null && { source }),
            // ADR-007 result card fields. Pulled from the full doc so the
            // existing match cache (predating this ADR) gets the new fields
            // on first cached-path read instead of waiting for a fresh match.
            ...(d?.card != null && { card: d.card }),
            ...(d?.github_metrics != null && { github_metrics: d.github_metrics }),
            ...(d?.work_history != null && { work_history: d.work_history }),
          };
        } catch {
          return { ...item, shortlistRank };
        }
      })
    );
    return { success: true, top20: enriched, etiDistribution, seniority: String(jd.seniority ?? "") };
  }

  const jdRoleFitOneLiner = getJDRoleFitOneLiner(jd);
  const jobLocationTypes = toArray(jd.location_type).map(String).map(normalizeLocation).filter(Boolean);
  const jobAuth = (jd.work_auth_requirement as Record<string, boolean> | undefined) ?? {};

  // OPTIMIZATION: select only the fields the filter/sort/match pipeline needs.
  // Each candidate doc can be 20-100KB (the `breakdown` field is the big chunk);
  // selecting 3 nested fields drops per-doc transfer to ~500 bytes. For a
  // 10k-candidate pool this turns ~300MB / ~15s into ~5MB / ~2-3s. The top-10
  // docs are re-fetched in full (10 parallel point reads, ~200ms) right after
  // the sort.
  const candidatesSnap = await db
    .collection("candidates")
    .where("matchData.jobId", "==", jdId)
    .select("score", "profile.role_fit", "matchData.authRegions")
    .get();
  let list: CandidateDoc[] = [];
  candidatesSnap.docs.forEach((d) => {
    const data = d.data() as Omit<CandidateDoc, "id">;
    list.push({ id: d.id, ...data } as CandidateDoc);
  });

  const etiDistribution = buildEtiDistributionFromScores(list.map((c) => Number(c.score) || 0));
  const candidateRoleFits = list.map((c) => getCandidateRoleFitOneLiner(c));

  log("info", "match.pool_loaded", { ...ctx, jdId, poolSize: list.length, jdRoleFitPresent: Boolean(jdRoleFitOneLiner) });

  const roleFitResults = await geminiBatchMatch(jdRoleFitOneLiner, candidateRoleFits, { ...ctx, jdId });
  list = list.filter((_, i) => {
    const label = roleFitResults[i];
    return label === "MATCH" || label === "ADJACENT";
  });
  list = list.filter((c) => (c.score ?? 0) >= 50);
  list = list.filter((c) =>
    workAuthMatch(jobAuth, jobLocationTypes, (c.matchData as Record<string, unknown>)?.authRegions as string[] | undefined)
  );

  list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = list.slice(0, TOP_MATCH_COUNT);

  // Re-fetch FULL docs for the top 20 only. The minimal scan above didn't
  // include candidateName, email, full profile (ramp/supervision/risk_flags),
  // full matchData (workTypes/locations), or resumePath.
  // Single batched fetch, bounded at ~200ms.
  // ADR-009: shortlistRank (index+1, 1-20) + matchData.source enrich each
  // entry, powering the shortlist-quality (#6) + channel-strength (#7) funnels.
  const top20 = await Promise.all(
    top.map(async (c, i) => {
      const shortlistRank = i + 1;
      try {
        const fullSnap = await db.collection("candidates").doc(c.id).get();
        if (!fullSnap.exists) {
          // Candidate deleted between scan and enrichment (rare).
          return {
            id: c.id,
            score: c.score,
            yoe: c.yoe,
            profile: c.profile,
            role_fit: c.profile?.role_fit,
            candidateName: "",
            email: "",
            matchData: c.matchData,
            resume_url: null,
            shortlistRank,
          };
        }
        const full = (fullSnap.data() ?? {}) as Record<string, unknown>;
        const source = (full.matchData as { source?: unknown } | undefined)?.source;
        const resumePath = typeof full.resumePath === "string" ? full.resumePath : null;
        const resumeUrl = await freshResumeUrl(resumePath);
        const profileObj = full.profile as { role_fit?: unknown; [k: string]: unknown } | undefined;
        return {
          id: c.id,
          score: typeof full.score === "number" ? full.score : c.score,
          yoe: typeof full.yoe === "number" ? full.yoe : undefined,
          profile: profileObj,
          role_fit: profileObj?.role_fit ?? c.profile?.role_fit,
          candidateName: typeof full.candidateName === "string" ? full.candidateName : "",
          email: typeof full.email === "string" ? full.email : "",
          matchData: full.matchData ?? c.matchData,
          resume_url: resumeUrl,
          // ADR-009: rank-stratification + source attribution. Conditional
          // spread on source so a missing value never serializes undefined.
          shortlistRank,
          ...(source != null && { source }),
          // ADR-007 result card fields. Conditionally spread so missing
          // fields don't pollute the JSON with explicit undefineds.
          ...(full.card != null && { card: full.card }),
          ...(full.github_metrics != null && { github_metrics: full.github_metrics }),
          ...(full.work_history != null && { work_history: full.work_history }),
        };
      } catch (err) {
        log("warn", "match.top20_enrich_failed", { ...ctx, candidateId: c.id }, err);
        return {
          id: c.id,
          score: c.score,
          yoe: c.yoe,
          profile: c.profile,
          role_fit: c.profile?.role_fit,
          matchData: c.matchData,
          candidateName: "",
          email: "",
          resume_url: null,
          shortlistRank,
        };
      }
    })
  );

  // ADR-009: freeze shortlistRank onto each candidate doc so the analytics
  // funnel keeps the rank even after the candidate leaves the shortlist view.
  // Batched to one round trip; fire-and-forget so a write failure never fails
  // the match. Uses set+merge (not update): a candidate can be deleted between
  // the scan and this write, and batch.update on a missing doc rejects the
  // ENTIRE atomic batch — set+merge is the create-or-update that never throws,
  // so one stale entry can't drop every other candidate's rank.
  try {
    const rankBatch = db.batch();
    top20.forEach((entry) => {
      rankBatch.set(
        db.collection("candidates").doc(entry.id),
        { shortlistRank: entry.shortlistRank },
        { merge: true }
      );
    });
    await rankBatch.commit();
  } catch (rankErr) {
    log("warn", "match.shortlist_rank_write_failed", { ...ctx, jdId }, rankErr);
  }

  const top20Persisted = top20.map(({ resume_url: _omit, ...rest }) => {
    void _omit;
    return rest;
  });

  try {
    await db.collection("jds").doc(jdId).update({
      matchResult: { top20: top20Persisted, completedAt: FieldValue.serverTimestamp() },
    });
  } catch (writeErr) {
    log("warn", "match.result_cache_write_failed", { ...ctx, jdId }, writeErr);
  }

  log("info", "match.run_ok", {
    ...ctx,
    jdId,
    poolSize: roleFitResults.length,
    matchOrAdjacent: roleFitResults.filter((r) => r === "MATCH" || r === "ADJACENT").length,
    afterFilters: list.length,
    top20Count: top20.length,
    latencyMs: tRun(),
  });

  return { success: true, top20, etiDistribution, seniority: String(jd.seniority ?? "") };
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
    const result = await runMatch(jobId, userId, ctx);
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
