import { NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { getAdminDb, FieldValue, adminStorageUpload } from "@/lib/firebase-admin";
import { allowRequest } from "@/lib/rate-limit";
import { getRequestId, log, timeMs } from "@/lib/server-logger";
import { canEvaluate } from "@/lib/entitlements";
import { verifyTurnstile } from "@/lib/turnstile";
import { normalizeSource } from "@/lib/source-attribution";


// Junior path can spend 35-60s in Doc AI + GitHub + 2 LLM calls. 60s left no
// headroom for cold starts or GitHub backoff; 120s gives a comfortable margin
// while still failing fast on stuck requests.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Per-jobId submission ceiling. 100/minute is ~10x the busiest realistic human
// burst (HN frontpage, YC share-out) and ~10x the per-IP limit, so legitimate
// candidates never see this — it only catches distributed bot floods against
// one intake link. The credit balance is still the real spend ceiling.
const PER_JOB_SUBMISSION_LIMIT = 100;
const PER_JOB_SUBMISSION_WINDOW_SECONDS = 60;

// Resume upload caps. Base64 inflates the binary by ~33%, so 7M chars ≈ 5.25MB
// PDF. Real-world resumes are <500KB; 5MB is generous headroom for portfolios.
// Defends against (a) accidental huge uploads driving Doc AI cost spikes and
// (b) malicious uploads of non-PDF binaries.
const MAX_RESUME_BASE64_CHARS = 7 * 1024 * 1024;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
// Conforming PDFs end with "%%EOF" in the trailer. We scan the last 1 KB so
// trailing whitespace / line terminators don't trip the check. This catches
// truncated PDFs and "garbage with a forged %PDF- header" attacks.
const PDF_EOF = Buffer.from([0x25, 0x25, 0x45, 0x4f, 0x46]); // "%%EOF"
const PDF_EOF_SCAN_BYTES = 1024;
// Header must read "%PDF-1.x" or "%PDF-2.x" (Adobe's published versions).
// Anything else is a non-conforming binary even if it passed the magic check.
const PDF_HEADER_VERSION_RE = /^%PDF-[12]\.\d/;

// ------------------------------------------------------
// MAIN ROUTE
// ------------------------------------------------------
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const route = "/api/candidate/evaluate";
  const tTotal = timeMs();

  try {
    // Public endpoint: rate limit to protect Document AI / LLM spend.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "unknown";
    const rl = await allowRequest({ key: `candidate_evaluate:${ip}`, limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      log("warn", "rate_limit.blocked", { requestId, route, ip, resetAtMs: rl.resetAtMs });
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = await req.json();
    const {
      name,
      email,
      workTypes,
      locations,
      authRegions,
      experience,
      minCompensation,
      maxCompensation,
      resumeBase64,
      githubUrl,
      projectLinks,
      source,
      jobId
    } = body;

    // ---- Bot guards: reject before any screen-consuming work ----
    // Honeypot: a hidden form field real applicants never fill.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      log("warn", "candidate.honeypot_tripped", { requestId, route, jobId: typeof jobId === "string" ? jobId : undefined });
      return NextResponse.json({ error: "rejected" }, { status: 400 });
    }
    // Cloudflare Turnstile — bot challenge; skipped entirely if TURNSTILE_SECRET
    // is unset (honeypot above still applies).
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    if (!(await verifyTurnstile(turnstileToken))) {
      log("warn", "candidate.turnstile_failed", { requestId, route, jobId: typeof jobId === "string" ? jobId : undefined });
      return NextResponse.json(
        { error: "verification_failed", message: "We couldn't verify your submission. Please refresh and try again." },
        { status: 403 }
      );
    }

    const cleanBase64 = resumeBase64 ? String(resumeBase64).replace(/^data:(.*?);base64,/, "") : null;
    if (!cleanBase64) {
      return NextResponse.json({ error: "resume_required" }, { status: 400 });
    }

    // Size cap (string length, no decode required yet).
    if (cleanBase64.length > MAX_RESUME_BASE64_CHARS) {
      log("warn", "resume.too_large", {
        requestId,
        route,
        base64Chars: cleanBase64.length,
      });
      return NextResponse.json(
        {
          error: "resume_too_large",
          message: "Resume must be a PDF under 5 MB.",
        },
        { status: 413 }
      );
    }

    // Magic-bytes check on decoded buffer. Defends against a non-PDF uploaded
    // as ".pdf" that would either crash Document AI or burn quota processing
    // garbage. We decode once here and reuse the buffer below.
    let resumeBytes: Buffer;
    try {
      resumeBytes = Buffer.from(cleanBase64, "base64");
    } catch {
      return NextResponse.json(
        { error: "resume_invalid", message: "Resume could not be decoded." },
        { status: 400 }
      );
    }
    if (
      resumeBytes.length < PDF_MAGIC.length ||
      !resumeBytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
    ) {
      log("warn", "resume.not_pdf", {
        requestId,
        route,
        bytes: resumeBytes.length,
      });
      return NextResponse.json(
        {
          error: "resume_not_pdf",
          message: "Resume must be a PDF file.",
        },
        { status: 415 }
      );
    }

    // PDF header version sanity. Reading the first 8 bytes as ASCII gives us
    // "%PDF-1.7" or similar; we require a 1.x / 2.x version. Catches binaries
    // that managed to start with the magic bytes but aren't real PDFs.
    const headerBytes = resumeBytes.subarray(0, 8).toString("ascii");
    if (!PDF_HEADER_VERSION_RE.test(headerBytes)) {
      log("warn", "resume.bad_pdf_version", {
        requestId,
        route,
        // strip non-printable so the log line is greppable
        header: headerBytes.replace(/[^\x20-\x7e]/g, "?"),
      });
      return NextResponse.json(
        {
          error: "resume_not_pdf",
          message: "Resume must be a PDF file.",
        },
        { status: 415 }
      );
    }

    // PDF trailer check. Every conforming PDF ends with "%%EOF" within the
    // last ~1 KB. Catches:
    //   - Truncated uploads (e.g. partial transfers from flaky clients)
    //   - "Garbage padded with a fake %PDF- header" cost-bomb attempts
    //   - Random binaries that happen to start with the magic bytes
    // It does NOT defend against decompression bombs inside conforming PDF
    // streams — that requires a real PDF parser (deferred; see
    // bugs-fixed/validation.txt).
    {
      const scanStart = Math.max(0, resumeBytes.length - PDF_EOF_SCAN_BYTES);
      const tail = resumeBytes.subarray(scanStart);
      if (tail.indexOf(PDF_EOF) === -1) {
        log("warn", "resume.no_pdf_trailer", {
          requestId,
          route,
          bytes: resumeBytes.length,
        });
        return NextResponse.json(
          {
            error: "resume_malformed_pdf",
            message: "Resume PDF appears to be incomplete or corrupted. Please re-upload.",
          },
          { status: 415 }
        );
      }
    }

    // ------------------------------------------------------
    // Per-jobId submission rate limit (bot-flood backstop, not human throttle).
    // Skipped when jobId missing (legacy/non-JD submissions stay unchanged).
    // ------------------------------------------------------
    if (jobId && typeof jobId === "string") {
      const jrl = await allowRequest({
        key: `candidate_evaluate_job:${jobId}`,
        limit: PER_JOB_SUBMISSION_LIMIT,
        windowSeconds: PER_JOB_SUBMISSION_WINDOW_SECONDS,
      });
      if (!jrl.allowed) {
        log("warn", "rate_limit.job_blocked", {
          requestId,
          route,
          jobId,
          ip,
          resetAtMs: jrl.resetAtMs,
        });
        const retryAfterSec = Math.max(
          1,
          Math.ceil((jrl.resetAtMs - Date.now()) / 1000)
        );
        return NextResponse.json(
          {
            error: "rate_limited",
            message:
              "We're receiving a lot of applications right now. Please try again in a moment.",
            retryAfter: retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSec) },
          }
        );
      }
    }

    // ------------------------------------------------------
    // Load job: owner, isClosed gate, submissionCap gate
    // ------------------------------------------------------
    let userId: string | null = null;
    let ownerOrgId: string | null = null;
    let jobData: Record<string, unknown> | null = null;
    if (jobId && typeof jobId === "string") {
      const db = getAdminDb();
      const jobSnap = await db.collection("jds").doc(jobId).get();
      const rawJobData = jobSnap.data();
      jobData = (rawJobData ?? null) as Record<string, unknown> | null;
      userId = typeof jobData?.userId === "string" ? (jobData.userId as string) : null;
      ownerOrgId = typeof jobData?.orgId === "string" ? (jobData.orgId as string) : null;
    }

    // isClosed gate: founder explicitly closed the pipeline. Previously this
    // field was decorative (set on the JD doc but never enforced) — see
    // bugs-fixed/validation.txt (2026-06-03).
    if (jobData && jobData.isClosed === true) {
      log("info", "candidate.submission_blocked_closed", { requestId, route, jobId });
      return NextResponse.json(
        {
          error: "job_closed",
          message: "This job is no longer accepting applications.",
        },
        { status: 403 }
      );
    }

    // submissionCap gate: count candidates already submitted OR processing.
    // We count both so a burst of in-flight submissions can't all sneak in
    // ahead of any one of them landing in "submitted". Same bugs-fixed entry.
    if (jobData && jobId && typeof jobId === "string") {
      const rawCap = typeof jobData.submissionCap === "number"
        ? jobData.submissionCap
        : parseInt(String(jobData.submissionCap ?? ""), 10);
      const cap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : null;
      if (cap !== null) {
        const db = getAdminDb();
        const inFlightSnap = await db
          .collection("candidates")
          .where("matchData.jobId", "==", jobId)
          .where("status", "in", ["submitted", "processing"])
          .get();
        if (inFlightSnap.size >= cap) {
          log("info", "candidate.submission_blocked_cap", {
            requestId,
            route,
            jobId,
            cap,
            count: inFlightSnap.size,
          });
          return NextResponse.json(
            {
              error: "submission_cap_reached",
              message: "This job has reached its application limit.",
            },
            { status: 403 }
          );
        }
      }
    }

    if (ownerOrgId) {
      const decision = await canEvaluate(ownerOrgId);
      if (!decision.allowed) {
        return NextResponse.json(
          {
            error: "no_screens",
            message:
              "This role isn't accepting applications right now. The employer's been notified — please check back soon.",
          },
          { status: 402 }
        );
      }
    }

    // ------------------------------------------------------
    // Create candidate stub (processing) + upload resume + enqueue job
    // ------------------------------------------------------
    // Channel attribution (ADR-009 §7 KPI #7). The client resolves it via the
    // ?src= ?? document.referrer ?? self-report waterfall; we canonicalize it
    // here and only persist when present (conditional spread below — Firestore
    // rejects undefined). Null/empty stays off the doc (dark social / referral).
    const candidateSource = normalizeSource(typeof source === "string" ? source : null);
    const db = getAdminDb();
    const docRef = await db.collection("candidates").add({
      candidateName: name ?? "",
      email: email ?? "",
      matchData: {
        jobId: jobId ?? null,
        workTypes,
        locations,
        ...(candidateSource != null && { source: candidateSource }),
        // Work-authorization regions drive workAuthMatch() in the match
        // pipeline. The intake form collects and requires these; persisting
        // them here is mandatory — without it every JD with a US/EU work-auth
        // requirement silently filtered out 100% of candidates.
        authRegions: Array.isArray(authRegions)
          ? authRegions.filter((r: unknown) => typeof r === "string")
          : [],
        minSalary: minCompensation,
        maxSalary: maxCompensation,
        yearsExperience: experience,
        github: githubUrl || null,
        portfolio: projectLinks || []
      },
      experienceLevel: experience === "<2" ? "Junior" : "Senior",
      timestamp: FieldValue.serverTimestamp(),
      status: "processing",
    });

    const resumePath = `resumes/${docRef.id}.pdf`;
    const tUp = timeMs();
    // resumeBytes was decoded + magic-checked earlier; reuse to avoid a second
    // base64 decode of a multi-MB string.
    // The signed URL returned by adminStorageUpload is short-lived (1h) by
    // design — we deliberately discard it. Any consumer needing a URL calls
    // freshResumeUrl(path) at read time. See bugs-fixed/storage.txt (2026-06-03).
    await adminStorageUpload(resumePath, resumeBytes);
    log("info", "resume.upload_ok", { requestId, route, candidateId: docRef.id, latencyMs: tUp(), bytes: resumeBytes.byteLength });

    // Per-candidate access token: lets the candidate view their own dashboard
    // (status only) without Firebase auth, while keeping the /api/candidate/[id]
    // endpoint closed to ID-guessing attackers. See bugs-fixed/security.txt.
    const accessToken = randomUUID();

    await db.collection("candidates").doc(docRef.id).set(
      { resumePath, accessToken },
      { merge: true }
    );

    const evalJobRef = await db.collection("evaluationJobs").add({
      status: "queued",
      attempts: 0,
      candidateId: docRef.id,
      jobId: jobId ?? null,
      ownerUserId: userId,
      ownerOrgId,
      resumePath,
      githubUrl: githubUrl || null,
      experience: experience ?? null,
      createdAt: FieldValue.serverTimestamp(),
      lastError: null,
    });

    log("info", "evaluation.enqueued", {
      requestId,
      route,
      candidateId: docRef.id,
      jobId: jobId ?? undefined,
      userId: userId ?? undefined,
      evaluationJobId: evalJobRef.id,
      latencyMs: tTotal(),
    });

    // Fire-and-forget worker self-trigger. Runs AFTER the response is sent
    // (via Next.js `after()`), so the candidate sees their submission redirect
    // immediately and the worker processes asynchronously.
    //
    // Target URL resolution:
    //   1. If CLOUD_RUN_WORKER_URL is set, fire at the Cloud Run service
    //      (the production path post-migration; see docs/adr/001).
    //   2. Otherwise fall back to the in-Vercel /api/worker/evaluate route
    //      (the rollback path; instant revert by unsetting the env var).
    //
    // If the fetch itself fails (network, transient), the Cloud Scheduler
    // safety-net cron (or the Vercel daily cron in fallback mode) will
    // claim the queued job within the cron interval. See
    // FAANG-Analysis.txt 2026-06-03 (worker trigger) and 2026-06-04
    // (Cloud Run migration) for the architecture story.
    const workerSecret = process.env.WORKER_SECRET ?? "";
    const cloudRunWorkerUrl = process.env.CLOUD_RUN_WORKER_URL ?? "";
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
    const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const workerUrlBase = cloudRunWorkerUrl
      ? cloudRunWorkerUrl.replace(/\/+$/, "")
      : forwardedHost
      ? `${forwardedProto}://${forwardedHost}/api`
      : "";
    if (workerSecret && workerUrlBase) {
      const evaluationJobId = evalJobRef.id;
      const workerUrl = `${workerUrlBase}/worker/evaluate`;
      after(async () => {
        try {
          const res = await fetch(workerUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-worker-secret": workerSecret,
            },
            body: JSON.stringify({ jobId: evaluationJobId }),
            cache: "no-store",
          });
          if (!res.ok) {
            log("warn", "evaluation.self_trigger_non_ok", {
              requestId,
              route,
              evaluationJobId,
              status: res.status,
            });
          }
        } catch (err) {
          log(
            "warn",
            "evaluation.self_trigger_failed",
            { requestId, route, evaluationJobId },
            err
          );
        }
      });
    } else {
      log("warn", "evaluation.self_trigger_skipped", {
        requestId,
        route,
        evaluationJobId: evalJobRef.id,
        reason: !workerSecret ? "missing_worker_secret" : "missing_host",
      });
    }

    return NextResponse.json({
      success: true,
      id: docRef.id,
      accessToken,
      redirect: `/candidate/dashboard?id=${docRef.id}&t=${accessToken}`,
      status: "processing",
      evaluationJobId: evalJobRef.id,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing Failed";
    log("error", "candidate.evaluate_failed", { requestId, route, latencyMs: tTotal() }, error);
    return NextResponse.json(
      { error: "Processing Failed", message },
      { status: 500 }
    );
  }
}
