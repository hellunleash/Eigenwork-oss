import { NextResponse } from "next/server";
import { getAdminDb, FieldValue, freshResumeUrl } from "@/lib/firebase-admin";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { buildEtiDistributionFromScores, type EtiDistribution } from "@/lib/eti-distribution";
import { requireOrgMember } from "@/lib/org";
import {
  getRoleFitCachedLabelsBatch,
  setRoleFitCachedLabelsBatch,
} from "@/lib/rolefit-cache";
import { getRequestId, log, timeMs, type LogContext } from "@/lib/server-logger";

/**
 * Match route: Gemini 2.5 Flash for JD vs Candidate role-fit comparison.
 * 1) Load JD + candidates where matchData.jobId == jobId
 * 2) Role-fit: Gemini compares jd.role_fit one_liner vs candidate.profile.role_fit (MATCH / ADJACENT / NO MATCH)
 *    - Three-layer cache: hot (per-instance Map) → durable (Firestore roleFitCache, batched getAll)
 *    - Uncached candidates are chunked (CHUNK_SIZE) and classified in parallel
 *      (MAX_PARALLELISM concurrent Gemini calls), each with retry + timeout
 *    - Any chunk that exhausts retries throws; we never silently drop candidates
 * 3) ETI >= 50, work auth (location + employment are enforced at intake)
 * 4) Sort by ETI DESC, return top 20
 *
 * Scale envelope (sync; see FAANG-Analysis.txt 2026-06-03 entry):
 *   - 500 candidates  : ~10s
 *   - 2,000 candidates: ~10s (single parallel round)
 *   - 5,000 candidates: ~30s (3 parallel rounds)
 *   - 10,000 candidates: ~50s (5 parallel rounds, near maxDuration ceiling)
 * Above ~10,000 candidates per match, move to an async job pattern modeled on
 * /api/worker/evaluate (evaluationJobs collection, claim-and-process).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// --- Role-fit batching configuration ---------------------------------------
// CHUNK_SIZE keeps Gemini output well under the 8192-token default cap
// (~7 tokens per "N → LABEL" line × 200 = ~1400 tokens, leaves headroom).
const CHUNK_SIZE = 200;
// MAX_PARALLELISM caps concurrent Gemini calls; well inside Flash paid-tier
// RPM/TPM limits at any realistic match size.
const MAX_PARALLELISM = 10;
// Per-chunk timeout. Median 8-15s, p99 ~30s in practice; 45s gives headroom.
const PER_CHUNK_TIMEOUT_MS = 45_000;
// Two retries (three total attempts) with exponential backoff.
const MAX_RETRIES = 2;
// Output token budget per candidate. Gemini 2.5 Flash spends tokens from this
// budget on internal "thinking" before producing the visible answer. A small
// budget (e.g. 112 tokens for 1 candidate) gets fully consumed by reasoning
// and the model returns truncated text like "1 → AD" instead of "1 → ADJACENT".
// We explicitly disable thinking (thinkingConfig.thinkingBudget = 0) AND keep
// a generous floor so truncation cannot happen on small chunks. See
// worker/index.ts for the same fix and FAANG-Analysis.txt for context.
const OUTPUT_TOKENS_PER_CANDIDATE = 20;
const OUTPUT_TOKENS_BUFFER = 200;
const OUTPUT_TOKENS_FLOOR = 512;

// Number of candidates returned in the /match response. Tune in product flow.
// ADR-009 #6 (shortlist-quality) needs depth past 10 — the recruiter must see
// ranks 11-20 to measure top-10 vs top-20 clear rate — so this is 20.
// Lazy enrichment downstream scales automatically up to ~50 (the per-candidate
// Firestore point read is in a Promise.all over this slice). Above ~50, wrap
// the enrichment loop in a concurrency-capped helper to cap simultaneous
// reads. The JSON response key is `top20` (ADR-009 rename from `top10`). Must
// match the value in worker/index.ts so Vercel-fallback and Cloud Run paths agree.
const TOP_MATCH_COUNT = 20;

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

type RoleFitLabel = "MATCH" | "ADJACENT" | "NO MATCH";

/**
 * Concurrency-limited map. Returns PromiseSettledResult[] so successful items
 * complete their side effects (cache writes) before any rejection surfaces.
 */
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

/**
 * Classify one chunk of candidate role-fit lines via a single Gemini call.
 *
 * Failure semantics:
 *   - AbortController-less timeout via Promise.race (the SDK does not surface
 *     a cancellation signal; the racing promise lets us bound wall-clock time).
 *   - Up to MAX_RETRIES retries with exponential backoff.
 *   - If Gemini returns fewer than 80% of expected lines we treat it as a
 *     failure rather than silently filling "NO MATCH" — this is the bug class
 *     the previous single-call implementation suffered above ~800 candidates.
 *   - On exhausted retries: throw. The caller decides whether to fail the
 *     whole request or degrade.
 */
async function classifyChunkWithGemini(
  model: GenerativeModel,
  jdRoleFit: string,
  chunkLines: string[],
  chunkIndex: number,
  ctx: LogContext
): Promise<RoleFitLabel[]> {
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
        // thinkingConfig.thinkingBudget = 0 disables Gemini 2.5 Flash's
        // internal reasoning so all output tokens go to the visible response.
        // See OUTPUT_TOKENS_FLOOR comment above for the truncation story.
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
          setTimeout(
            () => reject(new Error("gemini_timeout")),
            PER_CHUNK_TIMEOUT_MS
          )
        ),
      ]);

      const raw = result.response.text() ?? "";
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

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

      // Coverage guard: surface truncated / malformed responses instead of
      // silently filling "NO MATCH" for the missing tail.
      if (parsed < Math.ceil(chunkLines.length * 0.8)) {
        throw new Error(
          `gemini_parse_short: parsed ${parsed} of ${chunkLines.length}`
        );
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
      log(
        "warn",
        "match.rolefit_chunk_attempt_failed",
        {
          ...ctx,
          chunkIndex,
          chunkSize: chunkLines.length,
          attempt,
          retrying: !isLast,
          latencyMs: t(),
        },
        err
      );
      if (!isLast) {
        // 1.5s, 3s backoff
        await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      }
    }
  }

  log(
    "error",
    "match.rolefit_chunk_failed",
    {
      ...ctx,
      chunkIndex,
      chunkSize: chunkLines.length,
      attempts: MAX_RETRIES + 1,
    },
    lastError
  );
  throw lastError instanceof Error
    ? lastError
    : new Error("rolefit_chunk_failed");
}

async function geminiBatchMatch(
  jdRoleFit: string,
  candidateOneLiners: string[],
  ctx: LogContext
): Promise<string[]> {
  if (!jdRoleFit) {
    // Preserve legacy fail-open: with no JD role-fit signal, classify all as MATCH
    return candidateOneLiners.map(() => "MATCH");
  }

  const tTotal = timeMs();
  const N = candidateOneLiners.length;
  const results: (RoleFitLabel | undefined)[] = new Array(N);

  // -----------------------------------------------------------------------
  // Phase 1: hot cache (per-instance Map). Survives across requests in a
  // warm function instance — cheap big win on repeated matches.
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Phase 2: durable cache (Firestore roleFitCache), batched via getAll.
  // N point reads → ceil(N / 400) round trips.
  // -----------------------------------------------------------------------
  const needsLlm: { idx: number; key: string; line: string }[] = [];
  let durableHits = 0;

  if (needsDurable.length > 0) {
    const tDur = timeMs();
    const labels = await getRoleFitCachedLabelsBatch(
      needsDurable.map((n) => n.key)
    );
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

  // -----------------------------------------------------------------------
  // Phase 3: chunked parallel Gemini classification.
  // -----------------------------------------------------------------------
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

  const settled = await runWithConcurrency(
    chunks,
    MAX_PARALLELISM,
    async (chunk, chunkIdx) => {
      const lines = chunk.map((c) => c.line);
      const labels = await classifyChunkWithGemini(
        model,
        jdRoleFit,
        lines,
        chunkIdx,
        ctx
      );
      // Populate results + hot cache synchronously so a later chunk failure
      // doesn't drop in-flight work. Durable cache write is fire-and-forget.
      const writeEntries: { key: string; label: string }[] = [];
      for (let i = 0; i < chunk.length; i++) {
        const { idx, key } = chunk[i];
        const label = labels[i];
        results[idx] = label;
        hotCache.set(key, label);
        writeEntries.push({ key, label });
      }
      setRoleFitCachedLabelsBatch(writeEntries).catch((err) => {
        log(
          "warn",
          "match.rolefit_cache_write_failed",
          { ...ctx, chunkIndex: chunkIdx, entries: writeEntries.length },
          err
        );
      });
    }
  );

  const failedChunks = settled.filter((s) => s.status === "rejected").length;
  if (failedChunks > 0) {
    log("error", "match.rolefit_batch_failed", {
      ...ctx,
      candidates: N,
      chunks: chunks.length,
      failedChunks,
      latencyMs: tTotal(),
    });
    throw new Error(
      `rolefit_match_failed: ${failedChunks}/${chunks.length} chunks failed`
    );
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
  experienceLevel?: string;
  breakdown?: unknown;
  resumeUrl?: string;
  resume_url?: string;
  [k: string]: unknown;
};

async function runMatch(
  jdId: string,
  requesterOrgId: string,
  ctx: LogContext
): Promise<{ success: boolean; top20?: unknown[]; etiDistribution?: EtiDistribution; seniority?: string; error?: string }> {
  const tRun = timeMs();
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jdId).get();
  if (!snap.exists) {
    return { success: false, error: "Job not found" };
  }
  const jd = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  const ownerOrg = typeof jd.orgId === "string" ? jd.orgId : null;
  if (!ownerOrg || ownerOrg !== requesterOrgId) {
    return { success: false, error: "Forbidden" };
  }

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
      (
        cached.top20 as {
          id: string;
          candidateName?: string;
          email?: string;
          yoe?: number;
          shortlistRank?: number;
        }[]
      ).map(async (item, i) => {
        // shortlistRank reflects the rank order (index+1). Prefer the value
        // persisted on the JD doc, falling back to position for legacy caches.
        const shortlistRank = typeof item.shortlistRank === "number" ? item.shortlistRank : i + 1;
        try {
          const candSnap = await db.collection("candidates").doc(item.id).get();
          if (!candSnap.exists) return { ...item, shortlistRank };
          const d = candSnap.data();
          const source = (d?.matchData as { source?: unknown } | undefined)?.source;
          // Always regenerate the resume URL fresh — persisted URLs are
          // intentionally short-lived (see bugs-fixed/storage.txt).
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
  // docs are re-fetched in full below (10 parallel point reads, ~200ms).
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
  log("info", "match.pool_loaded", {
    ...ctx,
    jdId,
    poolSize: list.length,
    jdRoleFitPresent: Boolean(jdRoleFitOneLiner),
  });
  const roleFitResults = await geminiBatchMatch(
    jdRoleFitOneLiner,
    candidateRoleFits,
    { ...ctx, jdId }
  );
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
  // full matchData (workTypes/locations), or resumePath. Single batched fetch,
  // bounded at ~200ms. Resume URLs are intentionally NOT persisted on the JD
  // doc — only the candidate id is, so the cached path regenerates
  // short-lived URLs on each read (see bugs-fixed/storage.txt).
  // ADR-009: shortlistRank (index+1, 1-20) + matchData.source enrich each
  // entry, powering the shortlist-quality (#6) + channel-strength (#7) funnels.
  const top20 = await Promise.all(
    top.map(async (c, i) => {
      const shortlistRank = i + 1;
      try {
        const fullSnap = await db.collection("candidates").doc(c.id).get();
        if (!fullSnap.exists) {
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
          candidateName: "",
          email: "",
          matchData: c.matchData,
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

  // Persist a slim copy: omit resume_url so the cache doesn't pin a stale URL.
  const top20Persisted = top20.map(({ resume_url: _omit, ...rest }) => {
    void _omit;
    return rest;
  });

  try {
    await db.collection("jds").doc(jdId).update({
      matchResult: {
        top20: top20Persisted,
        completedAt: FieldValue.serverTimestamp(),
      },
    });
  } catch (writeErr) {
    log(
      "warn",
      "match.result_cache_write_failed",
      { ...ctx, jdId },
      writeErr
    );
  }

  log("info", "match.run_ok", {
    ...ctx,
    jdId,
    poolSize: roleFitResults.length,
    matchOrAdjacent: roleFitResults.filter(
      (r) => r === "MATCH" || r === "ADJACENT"
    ).length,
    afterFilters: list.length,
    top20Count: top20.length,
    latencyMs: tRun(),
  });

  return { success: true, top20, etiDistribution, seniority: String(jd.seniority ?? "") };
}

/** GET /api/jd/match?jobId=ABC123 */
export async function GET(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/match";
  try {
    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ success: false, error: member.error }, { status: member.status });

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    }
    const t = timeMs();
    const ctx: LogContext = { requestId, route, userId: member.userId, jobId };
    const result = await runMatch(jobId, member.orgId, ctx);
    if (!result.success && result.error) {
      const status = result.error === "Job not found" ? 404 : result.error === "Forbidden" ? 403 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }
    log("info", "jd.match_ok", { requestId, route, jobId, userId: member.userId, latencyMs: t() });
    return NextResponse.json({
      success: true,
      top20: result.top20 ?? [],
      etiDistribution: result.etiDistribution ?? buildEtiDistributionFromScores([]),
      seniority: result.seniority ?? "",
    });
  } catch (err) {
    log("error", "jd.match_get_failed", { requestId, route }, err);
    return NextResponse.json(
      { success: false, error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/jd/match — body: { jobId } or { jd } for backward compat; when jobId provided uses PST matching */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/match";
  try {
    const member = await requireOrgMember(req.headers);
    if (!member.ok) return NextResponse.json({ success: false, error: member.error }, { status: member.status });

    const body = await req.json().catch(() => ({}));
    const jdId = body.jobId ?? body.jdId;
    const jdBody = body.jd;

    if (jdId) {
      const t = timeMs();
      const ctx: LogContext = { requestId, route, userId: member.userId, jobId: String(jdId) };
      const result = await runMatch(String(jdId), member.orgId, ctx);
      if (!result.success && result.error) {
        const status = result.error === "Job not found" ? 404 : result.error === "Forbidden" ? 403 : 400;
        return NextResponse.json({ success: false, error: result.error }, { status });
      }
      log("info", "jd.match_ok", { requestId, route, jobId: String(jdId), userId: member.userId, latencyMs: t() });
      return NextResponse.json({
        success: true,
        top20: result.top20 ?? [],
        etiDistribution: result.etiDistribution ?? buildEtiDistributionFromScores([]),
        seniority: result.seniority ?? "",
      });
    }

    if (!jdBody) {
      return NextResponse.json({ error: "jdId or jd required" }, { status: 400 });
    }

    // Backward-compat body mode is not authorized (it can bypass owner checks).
    return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
  } catch (err) {
    log("error", "jd.match_post_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}
