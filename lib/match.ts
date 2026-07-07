/**
 * Match core (ADR-010 Phase 0 extraction).
 *
 * Previously this logic lived inline in BOTH app/api/jd/match/route.ts and
 * worker/index.ts (handleMatch) — a fork CLAUDE.md repeatedly warned about and
 * ADR-007 hit on its first deploy. The two copies had even drifted: the route
 * scoped ownership by `orgId` (post-ADR-002) while the worker still scoped by
 * the legacy `userId`. To de-fork WITHOUT silently changing either caller's
 * behavior, runMatch takes an injected `isOwner` predicate so each front door
 * keeps its exact ownership rule:
 *   - route:  (jd) => jd.orgId === member.orgId
 *   - worker: (jd) => jd.userId === userId   (legacy; see the worker drift note)
 *
 * NOTE (latent bug surfaced by the de-fork): the worker's userId-scoped ownership
 * is stale relative to the org-as-owner migration. It is preserved here verbatim
 * so this extraction is behavior-preserving; migrating the worker match path to
 * orgId is a separate, intentional change.
 *
 * Role-fit classification uses Gemini 2.5 Flash with a three-layer cache
 * (hot per-instance Map → durable Firestore roleFitCache → LLM). ETI >= 50 and
 * work-auth filters apply, sort by ETI desc, return top 20.
 */
import { getAdminDb, FieldValue, freshResumeUrl } from "@/lib/firebase-admin";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { buildEtiDistributionFromScores, type EtiDistribution } from "@/lib/eti-distribution";
import {
  getRoleFitCachedLabelsBatch,
  setRoleFitCachedLabelsBatch,
} from "@/lib/rolefit-cache";
import { log, timeMs, type LogContext } from "@/lib/server-logger";
import { runWithConcurrency } from "@/lib/concurrency";
import { coerceMlMode, type MlMode } from "@/lib/jd-parse";

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
// budget gets fully consumed by reasoning and the model returns truncated text
// like "1 → AD". We disable thinking (thinkingBudget = 0) AND keep a generous
// floor so truncation cannot happen on small chunks.
const OUTPUT_TOKENS_PER_CANDIDATE = 20;
const OUTPUT_TOKENS_BUFFER = 200;
const OUTPUT_TOKENS_FLOOR = 512;

// Number of candidates returned in the /match response. ADR-009 #6
// (shortlist-quality) needs depth past 10 — the recruiter must see ranks 11-20
// to measure top-10 vs top-20 clear rate — so this is 20. The JSON response key
// is `top20`.
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
 * Classify one chunk of candidate role-fit lines via a single Gemini call.
 * Bounded by Promise.race timeout + MAX_RETRIES; treats <80% parsed lines as a
 * failure (don't silently fill "NO MATCH" for a truncated tail). Throws on
 * exhausted retries — the caller decides whether to fail or degrade.
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

      if (parsed < Math.ceil(chunkLines.length * 0.8)) {
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
      log(
        "warn",
        "match.rolefit_chunk_attempt_failed",
        { ...ctx, chunkIndex, chunkSize: chunkLines.length, attempt, retrying: !isLast, latencyMs: t() },
        err
      );
      if (!isLast) {
        await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      }
    }
  }

  log(
    "error",
    "match.rolefit_chunk_failed",
    { ...ctx, chunkIndex, chunkSize: chunkLines.length, attempts: MAX_RETRIES + 1 },
    lastError
  );
  throw lastError instanceof Error ? lastError : new Error("rolefit_chunk_failed");
}

async function geminiBatchMatch(
  jdRoleFit: string,
  candidateOneLiners: string[],
  ctx: LogContext
): Promise<string[]> {
  if (!jdRoleFit) {
    // Preserve legacy fail-open: with no JD role-fit signal, classify all as MATCH.
    return candidateOneLiners.map(() => "MATCH");
  }

  const tTotal = timeMs();
  const N = candidateOneLiners.length;
  const results: (RoleFitLabel | undefined)[] = new Array(N);

  // Phase 1: hot cache (per-instance Map). Survives across requests in a warm instance.
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

  // Phase 2: durable cache (Firestore roleFitCache), batched via getAll.
  const needsLlm: { idx: number; key: string; line: string }[] = [];
  let durableHits = 0;

  if (needsDurable.length > 0) {
    const tDur = timeMs();
    const labels = await getRoleFitCachedLabelsBatch(needsDurable.map((n) => n.key));
    log("info", "match.rolefit_durable_lookup", { ...ctx, keys: needsDurable.length, latencyMs: tDur() });
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

  // Phase 3: chunked parallel Gemini classification.
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
    // Populate results + hot cache synchronously so a later chunk failure doesn't
    // drop in-flight work. Durable cache write is fire-and-forget.
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

function workAuthMatch(
  jobAuth: { us_required?: boolean; eu_required?: boolean; provided?: boolean },
  candidateAuthRegions: string[] | undefined
): boolean {
  if (jobAuth?.provided) return true;
  const regions = toArray(candidateAuthRegions).map((r) => String(r).toLowerCase());
  // No stored work-auth regions (legacy candidates, or a data gap): don't silently
  // reject — pass and let the recruiter judge. New submissions always carry
  // authRegions (intake requires at least one), so they're still filtered strictly.
  if (regions.length === 0) return true;
  // Work authorization is decoupled from work location (docs/work-auth-matching.md):
  // the candidate's location is locked to the JD at intake, so this gate checks only
  // legal authorization. The "Neither — I work remotely from my own country" answer
  // (stored as the legacy "Remote Global" value) carries no "us"/"eu" token, so it
  // naturally fails US/EU-required roles and passes No-requirement / Sponsor roles.
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
  breakdown?: unknown;
  resumeUrl?: string;
  resume_url?: string;
  [k: string]: unknown;
};

export type MatchResult = {
  success: boolean;
  top20?: unknown[];
  etiDistribution?: EtiDistribution;
  seniority?: string;
  error?: string;
};

/** ADR-013: a candidate's ml_mode facet, read off the persisted operating_profile
 *  the evaluator emitted. Absent/invalid (legacy docs, until re-evaluated) → "n/a",
 *  which is never demoted. */
function candidateMlMode(c: CandidateDoc): MlMode {
  return coerceMlMode((c.profile as { ml_mode?: unknown } | undefined)?.ml_mode);
}

/** ADR-013: tolerant AI/ML role_category check — the second, independent gate on
 *  the ml_mode demotion so it can never fire outside AI/ML roles. */
function isAiMlCategory(roleCategory: string): boolean {
  const c = roleCategory.toLowerCase();
  return (
    /\b(ai|ml)\b/.test(c) ||
    /machine learning|deep learning|artificial intelligence|data scien|computer vision|\bnlp\b|\bmlops\b|generative ai|genai/.test(c)
  );
}

/**
 * Run a role-fit match for one JD. `isOwner` is injected by the caller so each
 * front door keeps its exact ownership rule (route: orgId, worker: userId).
 * Returns `error: "Job not found"` for a missing JD and `error: "Forbidden"`
 * when `isOwner` rejects — both callers map those to 404 / 403.
 */
export async function runMatch(
  jdId: string,
  ctx: LogContext,
  isOwner: (jd: Record<string, unknown>) => boolean
): Promise<MatchResult> {
  const tRun = timeMs();
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jdId).get();
  if (!snap.exists) {
    return { success: false, error: "Job not found" };
  }
  const jd = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  if (!isOwner(jd)) {
    return { success: false, error: "Forbidden" };
  }

  // ADR-009: the persisted field + response property are `top20`. Legacy docs
  // that still hold `matchResult.top10` simply miss this cached-path lookup and
  // self-heal on the next fresh match run — no back-compat.
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
            shortlistRank,
            ...(source != null && { source }),
            ...(d?.card != null && { card: d.card }),
            ...(d?.github_metrics != null && { github_metrics: d.github_metrics }),
            ...(d?.work_history != null && { work_history: d.work_history }),
            ...(d?.inflationReview != null && { inflationReview: d.inflationReview }),
          };
        } catch {
          return { ...item, shortlistRank };
        }
      })
    );
    return { success: true, top20: enriched, etiDistribution, seniority: String(jd.seniority ?? "") };
  }

  const jdRoleFitOneLiner = getJDRoleFitOneLiner(jd);
  const jobAuth = (jd.work_auth_requirement as Record<string, boolean> | undefined) ?? {};

  // ADR-013: does this JD require model-BUILDING capability? Reads the ml_mode
  // facet the JD parser emitted. Double-gated: true only for an AI/ML-category
  // role whose facet is build-shaped ("builds_models" or "both").
  const jdMode = coerceMlMode(jd.ml_mode);
  const jdWantsBuilding =
    isAiMlCategory(String(jd.role_category ?? "")) &&
    (jdMode === "builds_models" || jdMode === "both");

  // OPTIMIZATION: select only the fields the filter/sort/match pipeline needs.
  // Each candidate doc can be 20-100KB (the `breakdown` field is the big chunk);
  // selecting 3 nested fields drops per-doc transfer to ~500 bytes. The top-20
  // docs are re-fetched in full below.
  const candidatesSnap = await db
    .collection("candidates")
    .where("matchData.jobId", "==", jdId)
    .select("score", "profile.role_fit", "profile.ml_mode", "matchData.authRegions")
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
  const roleFitResults = await geminiBatchMatch(jdRoleFitOneLiner, candidateRoleFits, { ...ctx, jdId });
  list = list.filter((_, i) => {
    const label = roleFitResults[i];
    return label === "MATCH" || label === "ADJACENT";
  });

  list = list.filter((c) => (c.score ?? 0) >= 50);
  list = list.filter((c) =>
    workAuthMatch(jobAuth, (c.matchData as Record<string, unknown>)?.authRegions as string[] | undefined)
  );

  // ADR-013: precompute each surviving candidate's ml_mode facet (persisted field,
  // else derived from role_fit tokens). When the JD needs model building, an
  // integrate-only candidate is DEMOTED below every other candidate — it sinks in
  // the shortlist (and falls off the top-20 if there are enough real fits) but is
  // never dropped. When jdWantsBuilding is false this is a pure score sort, exactly
  // as before — the facet touches nothing outside build-shaped AI/ML roles.
  const mlModeById = new Map<string, MlMode>(list.map((c) => [c.id, candidateMlMode(c)]));
  const isDemoted = (c: CandidateDoc): boolean =>
    jdWantsBuilding && mlModeById.get(c.id) === "integrates_models";
  const mlDemotedCount = jdWantsBuilding ? list.filter(isDemoted).length : 0;

  list.sort((a, b) => {
    const demoteDelta = Number(isDemoted(a)) - Number(isDemoted(b));
    if (demoteDelta !== 0) return demoteDelta; // non-demoted first
    return (b.score ?? 0) - (a.score ?? 0);
  });
  const top = list.slice(0, TOP_MATCH_COUNT);

  // Re-fetch FULL docs for the top 20 only. The minimal scan above didn't include
  // candidateName, email, full profile, full matchData, or resumePath. Single
  // batched fetch, bounded at ~200ms. ADR-009: shortlistRank (index+1) +
  // matchData.source enrich each entry for the shortlist-quality / channel funnels.
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
          shortlistRank,
          ...(source != null && { source }),
          ...(full.card != null && { card: full.card }),
          ...(full.github_metrics != null && { github_metrics: full.github_metrics }),
          ...(full.work_history != null && { work_history: full.work_history }),
          ...(full.inflationReview != null && { inflationReview: full.inflationReview }),
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

  // ADR-009: freeze shortlistRank onto each candidate doc so the analytics funnel
  // keeps the rank even after the candidate leaves the shortlist view. Batched to
  // one round trip; fire-and-forget. Uses set+merge (not update): a candidate can
  // be deleted between the scan and this write, and batch.update on a missing doc
  // rejects the ENTIRE atomic batch — set+merge never throws.
  try {
    const rankBatch = db.batch();
    top20.forEach((entry) => {
      rankBatch.set(db.collection("candidates").doc(entry.id), { shortlistRank: entry.shortlistRank }, { merge: true });
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
    log("warn", "match.result_cache_write_failed", { ...ctx, jdId }, writeErr);
  }

  log("info", "match.run_ok", {
    ...ctx,
    jdId,
    poolSize: roleFitResults.length,
    matchOrAdjacent: roleFitResults.filter((r) => r === "MATCH" || r === "ADJACENT").length,
    afterFilters: list.length,
    top20Count: top20.length,
    jdMlMode: jdMode,
    mlDemoted: mlDemotedCount,
    latencyMs: tRun(),
  });

  return { success: true, top20, etiDistribution, seniority: String(jd.seniority ?? "") };
}
