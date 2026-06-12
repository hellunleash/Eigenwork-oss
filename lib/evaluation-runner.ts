import { runJsonModel } from "@/lib/openai-client";
import { getRepoDNA } from "@/lib/github-utils";
import { extractResumeText } from "@/lib/docai-extract";
import { buildETIPrompt, truncateInput, cleanAndParseJSON } from "@/lib/eti/rubric-compress";
import { log, type LogContext, timeMs } from "@/lib/server-logger";

type ExperienceBucket = "<2" | ">=2" | string;

// Raw ETI is 0–85 (junior: ESQ+PDQ+NR; senior: OM+OD+PC). Normalize to 0–100 for display.
const MAX_RAW_SCORE = 85;
function normalizeScore(raw: number): number {
  return Math.min(100, Math.round((raw / MAX_RAW_SCORE) * 100));
}

// Scoring v2 is opt-in via env so a bad outcome is a config rollback, not a
// revert. Every result is stamped with the rubric that produced it so pools
// can be audited for mixed-rubric ranking (ADR-003: one pool, one rubric).
export type RubricVersion = "v1" | "v2";
export function activeRubricVersion(): RubricVersion {
  return process.env.ETI_RUBRIC_VERSION === "v2" ? "v2" : "v1";
}

// Overlord caps are a contract in NORMALIZED space — 40/85 and 46/85 of the
// display scale — so they hold even when a track is renormalized over a
// different max raw (e.g. junior scored without GitHub evidence). At
// maxRaw = MAX_RAW_SCORE this is exactly the historical min(raw, 40|46).
export function applyOverlordCap(rawScore: number, overlord: string | undefined, maxRaw: number): number {
  if (overlord === "inflated_cap_40") return Math.min(rawScore, (40 / 85) * maxRaw);
  if (overlord === "suspicious_cap_46") return Math.min(rawScore, (46 / 85) * maxRaw);
  return rawScore;
}

// Compact, persisted form of the v2 structured Overlord verdict. Kept small on
// purpose (a verdict + risk + a short trigger list) so it is cheap to store and
// to return from the owner API; JD-match uses .select() and never reads it.
export type OverlordTrigger = { id: string; reason: string };
export type OverlordVerdict = {
  verdict: "safe" | "suspicious" | "inflated";
  fraud_risk: number;
  triggered: OverlordTrigger[];
};

// Normalized result of parsing whatever the model returned for "overlord".
//   cap      — the legacy cap-string contract fed to applyOverlordCap.
//   verdict  — the compact structured verdict, present only for v2 object form.
export type ParsedOverlord = {
  cap: string | undefined;
  verdict?: OverlordVerdict;
};

// fraud_risk -> cap thresholds. >=0.66 inflated (cap-40), >=0.4 suspicious
// (cap-46), else safe. Mirrors the v1 numeric outcomes via the same cap strings.
const OVERLORD_INFLATED_THRESHOLD = 0.66;
const OVERLORD_SUSPICIOUS_THRESHOLD = 0.4;

function capFromVerdict(verdict: OverlordVerdict["verdict"], fraudRisk: number): string | undefined {
  // Prefer fraud_risk (the model may disagree with its own verdict label); fall
  // back to the verdict word if fraud_risk is missing/out of range.
  if (Number.isFinite(fraudRisk)) {
    if (fraudRisk >= OVERLORD_INFLATED_THRESHOLD) return "inflated_cap_40";
    if (fraudRisk >= OVERLORD_SUSPICIOUS_THRESHOLD) return "suspicious_cap_46";
    return undefined; // safe
  }
  if (verdict === "inflated") return "inflated_cap_40";
  if (verdict === "suspicious") return "suspicious_cap_46";
  return undefined;
}

// Tolerant parse of the model's "overlord" output. Accepts BOTH:
//   - the legacy v1 bare string ("safe" | "suspicious_cap_46" | "inflated_cap_40"),
//     which yields the EXACT v1 cap outcome and no structured verdict; and
//   - the v2 structured object { verdict, fraud_risk, triggered[] }, from which
//     the cap is derived in code (the model never picks the number).
// Anything else (missing/garbage) parses to "safe" (no cap, no verdict).
export function parseOverlord(raw: unknown): ParsedOverlord {
  if (typeof raw === "string") {
    // Legacy string contract — pass through unchanged for v1 compatibility.
    return { cap: raw === "inflated_cap_40" || raw === "suspicious_cap_46" ? raw : undefined };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const verdictWord = o.verdict === "inflated" || o.verdict === "suspicious" ? o.verdict : "safe";
    const fr = typeof o.fraud_risk === "number" ? o.fraud_risk : Number(o.fraud_risk);
    const fraud_risk = Number.isFinite(fr) ? Math.min(1, Math.max(0, fr)) : NaN;
    const triggered: OverlordTrigger[] = Array.isArray(o.triggered)
      ? o.triggered
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({ id: String(t.id ?? ""), reason: String(t.reason ?? "") }))
          .filter((t) => t.id || t.reason)
      : [];
    const cap = capFromVerdict(verdictWord, fraud_risk);
    // Re-derive the verdict word from the cap so the persisted verdict and the
    // applied cap can never disagree (fraud_risk is the source of truth).
    const finalVerdict: OverlordVerdict["verdict"] =
      cap === "inflated_cap_40" ? "inflated" : cap === "suspicious_cap_46" ? "suspicious" : "safe";
    return {
      cap,
      verdict: {
        verdict: finalVerdict,
        fraud_risk: Number.isFinite(fraud_risk) ? fraud_risk : 0,
        triggered,
      },
    };
  }
  return { cap: undefined };
}

// Senior Overlord ships in SHADOW MODE: v2 runs the check on seniors but only
// APPLIES the cap when ETI_OVERLORD_ENFORCE_SENIOR is truthy. Off (default) we
// log the would-be cap without reducing the senior score. Junior caps always
// apply. Read per-call so the flag can be flipped without a redeploy.
export function enforceSeniorOverlord(): boolean {
  const v = process.env.ETI_OVERLORD_ENFORCE_SENIOR;
  return v === "1" || v === "true" || v === "TRUE";
}

function safeYoe(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99.9) return undefined;
  return Math.round(n * 10) / 10;
}

function extractJSON(text: string, ctx: LogContext) {
  try {
    return cleanAndParseJSON(text);
  } catch (e) {
    log("warn", "evaluation.json_parse_failed", ctx, e);
    return {};
  }
}

// Transient OpenAI failures (429 rate-limit, 5xx, network/empty-output) are
// retried with exponential backoff that honors a server-sent Retry-After; other
// 4xx (bad request) fail fast. This is what makes the now-concurrent junior
// blocks safe: a rate-limit response waits and retries rather than failing the
// evaluation outright.
const MAX_LLM_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

function llmStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } };
  const s = e?.status ?? e?.response?.status;
  return typeof s === "number" ? s : undefined;
}

function llmRetryAfterMs(err: unknown): number | undefined {
  const e = err as {
    headers?: Record<string, unknown>;
    response?: { headers?: Record<string, unknown> };
  };
  const headers = e?.headers ?? e?.response?.headers;
  const raw = headers?.["retry-after"];
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : undefined;
}

function isTransientLlmError(err: unknown): boolean {
  const status = llmStatus(err);
  if (status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  // No HTTP status = network error, timeout, or our own empty-output throw.
  if (status === undefined) return true;
  return false; // other 4xx — not worth retrying
}

async function safeGenerate(prompt: string, ctx: LogContext): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const t = timeMs();
      const text = await runJsonModel(prompt, 10000);
      log("info", "llm.openai_ok", { ...ctx, latencyMs: t() });
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_LLM_ATTEMPTS || !isTransientLlmError(err)) break;
      const backoff =
        llmRetryAfterMs(err) ??
        Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * 400);
      log("warn", "llm.openai_retry", { ...ctx, attempt, backoffMs: backoff }, err);
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("safeGenerate failed");
}

export type EvaluationInput = {
  resumeBase64?: string | null;
  githubUrl?: string | null;
  experience: ExperienceBucket;
};

export type EvaluationResult = {
  score: number;
  yoe?: number;
  breakdown: unknown;
  profile: unknown;
  is_matchable: boolean;
  overlord?: string;
  // Compact v2 structured verdict (verdict + fraud_risk + short trigger list).
  // Present only when the model returned the structured object form; v1 string
  // results carry only the legacy `overlord` field above.
  overlord_verdict?: OverlordVerdict;
  rawScore?: number;
  rubric_version: RubricVersion;
};

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function runEvaluation(input: EvaluationInput, ctx: LogContext): Promise<EvaluationResult> {
  const serverDate = new Date().toISOString().slice(0, 10);

  const cleanBase64 = input.resumeBase64
    ? String(input.resumeBase64).replace(/^data:(.*?);base64,/, "")
    : null;

  const tExtract = timeMs();
  const extractedText = cleanBase64 ? await extractResumeText(cleanBase64) : "";
  log("info", "resume.extract_done", { ...ctx, latencyMs: tExtract(), extractedChars: extractedText.length });

  const resumeContext = truncateInput(`RESUME CONTENT:\n${extractedText || "No text extracted"}`, 20000);

  const isJunior = input.experience === "<2";
  let githubContext = "No GitHub";
  if (isJunior && input.githubUrl) {
    const t = timeMs();
    try {
      githubContext = (await getRepoDNA(input.githubUrl)) || "Repo inaccessible";
      log("info", "github.dna_ok", { ...ctx, latencyMs: t() });
    } catch (e) {
      log("warn", "github.dna_failed", { ...ctx, latencyMs: t() }, e);
      githubContext = "Repo inaccessible";
    }
  }

  if (isJunior) {
    // ESQ (scores GitHub DNA) and the behavioral block (scores the resume) take
    // independent inputs, so issue both model calls concurrently — this halves
    // the wall-clock of a junior evaluation. Peak request concurrency is capped
    // by the gate in lib/openai-client.ts and 429s are retried in safeGenerate,
    // so the extra simultaneous call does not risk rate-limit failures.
    const promptESQ = buildETIPrompt({ context: githubContext, mode: "junior-esq", rubricVersion: activeRubricVersion() });
    const promptBehav = buildETIPrompt({ context: resumeContext, mode: "junior-behavioral", currentDate: serverDate, rubricVersion: activeRubricVersion() });
    const [rawESQ, rawBehav] = await Promise.all([
      safeGenerate(promptESQ, { ...ctx, phase: "junior-esq" }),
      safeGenerate(promptBehav, { ...ctx, phase: "junior-behavioral" }),
    ]);
    const jsonESQ = extractJSON(rawESQ, { ...ctx, phase: "junior-esq" }) as Record<string, unknown>;
    const esq = jsonESQ ?? {};
    const ESQ = n(esq.A1) + n(esq.A2) + n(esq.A3) + n(esq.A4);
    const jsonBehav = extractJSON(rawBehav, { ...ctx, phase: "junior-behavioral" }) as Record<string, unknown>;

    const pdq = (jsonBehav.pdq_breakdown as Record<string, unknown> | undefined) ?? {};
    const nr = (jsonBehav.nr_breakdown as Record<string, unknown> | undefined) ?? {};
    const PDQ = n(pdq.B1) + n(pdq.B2) + n(pdq.B3);
    const NR = n(nr.C1) + n(nr.C2);

    let rawScore = ESQ + PDQ + NR;
    const overlord = typeof jsonBehav.overlord === "string" ? jsonBehav.overlord : undefined;
    rawScore = applyOverlordCap(rawScore, overlord, MAX_RAW_SCORE);
    const score = normalizeScore(rawScore);
    const yoe = safeYoe(jsonBehav.yoe);

    log("info", "evaluation.scored", { ...ctx, track: "junior", rawScore, score, overlord, ...(yoe != null ? { yoe } : {}) });

    return {
      score,
      ...(yoe != null && { yoe }),
      breakdown: {
        ESQ: { ...esq, ESQ },
        PDQ: { ...pdq, PDQ },
        NR: { ...nr, NR },
      },
      profile: (jsonBehav.operating_profile as unknown) ?? {},
      is_matchable: score >= 50,
      overlord,
      rawScore,
      rubric_version: activeRubricVersion(),
    };
  }

  const promptSenior = buildETIPrompt({ context: resumeContext, mode: "senior", currentDate: serverDate, rubricVersion: activeRubricVersion() });
  const raw = String(await safeGenerate(promptSenior, { ...ctx, phase: "senior" }));
  const json = extractJSON(raw, { ...ctx, phase: "senior" }) as Record<string, unknown>;

  const om = (json.om_breakdown as Record<string, unknown> | undefined) ?? {};
  const od = (json.od_breakdown as Record<string, unknown> | undefined) ?? {};
  const pc = (json.pc_breakdown as Record<string, unknown> | undefined) ?? {};
  const OM = n(om.A1) + n(om.A2) + n(om.A3);
  const OD = n(od.B1) + n(od.B2) + n(od.B3);
  const PC = n(pc.C1) + n(pc.C2) + n(pc.C3);

  let rawScore = OM + OD + PC;
  const overlord = typeof json.overlord === "string" ? json.overlord : undefined;
  rawScore = applyOverlordCap(rawScore, overlord, MAX_RAW_SCORE);
  const score = normalizeScore(rawScore);
  const yoe = safeYoe(json.yoe);

  const op = (json.operating_profile as Record<string, unknown> | undefined) ?? {};
  const profile = { ...op, ramp_expectation: (op as Record<string, unknown>).ramp ?? (op as Record<string, unknown>).ramp_expectation };

  log("info", "evaluation.scored", { ...ctx, track: "senior", rawScore, score, overlord, ...(yoe != null ? { yoe } : {}) });

  return {
    score,
    ...(yoe != null && { yoe }),
    breakdown: {
      OM: { ...om, OM },
      OD: { ...od, OD },
      PC: { ...pc, PC },
    },
    profile,
    is_matchable: score >= 50,
    overlord,
    rawScore,
    rubric_version: activeRubricVersion(),
  };
}

