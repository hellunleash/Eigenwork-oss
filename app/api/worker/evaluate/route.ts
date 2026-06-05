import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminDb, FieldValue, adminStorageDownload } from "@/lib/firebase-admin";
import { runEvaluation } from "@/lib/evaluation-runner";
import { makeOpId } from "@/lib/credit-ledger";
import { consumeEval } from "@/lib/entitlements";
import { getRequestId, log, timeMs } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Junior eval = Doc AI + GitHub fetches + Gemini core-file pick + 2 GPT-5.2
// calls. Worst-case wall-clock ~60s; 120s gives headroom for cold starts
// and GitHub backoff. See FAANG-Analysis.txt 2026-06-03 entry.
export const maxDuration = 120;

const WORKER_SECRET = process.env.WORKER_SECRET ?? "";
// Vercel Cron attaches Authorization: Bearer ${CRON_SECRET} to scheduled
// GETs. We accept that as a second valid credential alongside the
// self-trigger secret so the safety-net cron path needs no separate route.
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** Constant-time string comparison. Returns false on mismatched length
 *  without revealing it via timing — Buffer.from short-circuits if lengths
 *  differ and timingSafeEqual requires equal length. */
function secretsEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isAuthorized(req: Request): boolean {
  const workerSecret = req.headers.get("x-worker-secret") ?? "";
  if (WORKER_SECRET && secretsEqual(workerSecret, WORKER_SECRET)) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  if (CRON_SECRET && secretsEqual(authHeader, `Bearer ${CRON_SECRET}`)) return true;
  return false;
}

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
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, error: "not_found" };
      const data = snap.data() as EvalJob;
      if (data.status === "running" || data.status === "done") return { ok: false as const, error: "not_claimable" };
      tx.set(
        ref,
        { status: "running", startedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { ok: true as const, id: ref.id, data };
    });
    return claimed;
  }

  // Claim the oldest queued job (best-effort; not perfectly fair without an index).
  const qs = await db
    .collection("evaluationJobs")
    .where("status", "==", "queued")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (qs.empty) return { ok: false as const, error: "none" };
  const ref = qs.docs[0].ref;
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: "not_found" };
    const data = snap.data() as EvalJob;
    if (data.status !== "queued") return { ok: false as const, error: "not_claimable" };
    tx.set(ref, { status: "running", startedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true as const, id: ref.id, data };
  });
  return claimed;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/worker/evaluate";
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedJobId = typeof body.jobId === "string" ? body.jobId : null;

  const claimed = await claimJob(requestedJobId);
  if (!claimed.ok) {
    return NextResponse.json({ success: true, claimed: false, reason: claimed.error });
  }

  const { id: evalJobId, data } = claimed;
  const ctx = { requestId, route, opId: evalJobId, candidateId: data.candidateId, jobId: data.jobId ?? undefined, userId: data.ownerUserId ?? undefined };

  const tTotal = timeMs();
  log("info", "worker.job_claimed", ctx);

  const db = getAdminDb();
  const jobRef = db.collection("evaluationJobs").doc(evalJobId);
  const candidateRef = db.collection("candidates").doc(data.candidateId);

  try {
    const candSnap = await candidateRef.get();
    if (!candSnap.exists) {
      await jobRef.set({ status: "failed", lastError: "candidate_not_found", finishedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ success: false, error: "candidate_not_found" }, { status: 404 });
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

    // Update candidate doc (idempotent: only set if still processing or missing score).
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

    // Credits: deduct exactly once per candidate evaluation.
    //
    // Outcome handling:
    //   applied=true                          -> happy path, founder charged
    //   applied=false reason=duplicate        -> retry/replay; already charged
    //   applied=false reason=insufficient_*   -> founder balance hit 0 mid-burst
    //
    // For the insufficient_balance case we do NOT roll back the evaluation
    // (the work is already done; the candidate has a score). We flag the
    // candidate doc with creditNotDeducted:true so the founder can see in
    // their dashboard which candidates went through "on the house" after
    // their balance ran out, and we log loud so this case is easy to grep.
    if (data.ownerOrgId) {
      const opId = makeOpId({ source: "screen", candidateId: data.candidateId, jobId: data.jobId ?? "", orgId: data.ownerOrgId });
      const consumeResult = await consumeEval({
        orgId: data.ownerOrgId,
        jobId: data.jobId ?? null,
        opId,
        metadata: { candidateId: data.candidateId, jobId: data.jobId ?? null, evaluationJobId: evalJobId },
      });
      if (!consumeResult.applied && consumeResult.reason === "no_screens") {
        log("error", "screen.no_screens_at_debit", {
          ...ctx,
          opId,
        });
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
    return NextResponse.json({ success: true, claimed: true, jobId: evalJobId, candidateId: data.candidateId });
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
    return NextResponse.json({ success: false, error: "job_failed", retrying: shouldRetry }, { status: 500 });
  }
}

/**
 * GET handler for Vercel Cron's safety-net pass.
 *
 * Vercel Cron sends GET (not POST) and attaches Authorization: Bearer
 * ${CRON_SECRET}. We delegate to POST so there's exactly one job-processing
 * code path. Cron does not specify a jobId — POST then picks the oldest
 * queued job via the existing claimJob() fallback.
 *
 * See FAANG-Analysis.txt 2026-06-03 entry "Evaluation worker trigger".
 */
export async function GET(req: Request) {
  return POST(req);
}

