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
  rawScore?: number;
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
    const promptESQ = buildETIPrompt({ context: githubContext, mode: "junior-esq" });
    const promptBehav = buildETIPrompt({ context: resumeContext, mode: "junior-behavioral", currentDate: serverDate });
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
    if (overlord === "inflated_cap_40") rawScore = Math.min(rawScore, 40);
    if (overlord === "suspicious_cap_46") rawScore = Math.min(rawScore, 46);
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
    };
  }

  const promptSenior = buildETIPrompt({ context: resumeContext, mode: "senior", currentDate: serverDate });
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
  if (overlord === "inflated_cap_40") rawScore = Math.min(rawScore, 40);
  if (overlord === "suspicious_cap_46") rawScore = Math.min(rawScore, 46);
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
  };
}

