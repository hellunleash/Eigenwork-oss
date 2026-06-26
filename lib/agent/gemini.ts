import { GoogleGenerativeAI, type FunctionDeclaration, type GenerativeModel } from "@google/generative-ai";
import { log } from "@/lib/server-logger";

/**
 * Thin Gemini 2.5 Flash helpers for the agent (ADR-010 Phase 2, ADR-012 loop).
 *
 * Reuses the same model the match role-fit classifier uses (one provider, the
 * GEMINI_API_KEY already in env). Thinking is disabled (thinkingBudget=0) for
 * speed/cost — the agent's work is grounded retrieval + re-expression, not deep
 * reasoning. `geminiJson` returns null on a parse failure so callers can degrade.
 *
 * Every call logs `agent.gemini_usage` with the real token counts (Gemini's
 * usageMetadata) + the dollar cost at current 2.5 Flash rates — so per-message-kind
 * cost is MEASURED, not estimated (ADR-011 cost basis).
 *
 * ADR-012: `AGENT_MODEL` is the one-string knob for the tool-loop's primary model
 * (default `gemini-2.5-flash`; the documented GPT-5.4-mini fallback swaps in here,
 * targeted ~Oct 2026, without touching loop code). The pre-loop scope gate uses the
 * cheap `gemini-2.5-flash-lite` tier via the `model` option below.
 */
export const AGENT_MODEL = process.env.AGENT_MODEL || "gemini-2.5-flash";
export const FLASH_LITE_MODEL = "gemini-2.5-flash-lite";

// Gemini 2.5 Flash standard tier, 2026-06-24.
const INPUT_USD_PER_TOKEN = 0.3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 2.5 / 1_000_000;

type UsageResult = { response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } } };

function logUsage(label: string, result: UsageResult): void {
  const u = result.response.usageMetadata;
  if (!u) return;
  const inputTokens = u.promptTokenCount ?? 0;
  const outputTokens = u.candidatesTokenCount ?? 0;
  const costUsd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  log("info", "agent.gemini_usage", {
    label,
    inputTokens,
    outputTokens,
    totalTokens: u.totalTokenCount ?? inputTokens + outputTokens,
    costUsd: Number(costUsd.toFixed(6)),
  });
}
function getModel(opts: { json: boolean; temperature: number; model?: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: opts.model ?? "gemini-2.5-flash",
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as Record<string, unknown>,
  });
}

export async function geminiJson<T>(
  prompt: string,
  opts?: { temperature?: number; label?: string; model?: string }
): Promise<T | null> {
  const m = getModel({ json: true, temperature: opts?.temperature ?? 0, model: opts?.model });
  const res = await m.generateContent(prompt);
  logUsage(opts?.label ?? "gemini_json", res);
  const raw = (res.response.text() ?? "").trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function geminiText(
  prompt: string,
  opts?: { temperature?: number; label?: string; model?: string }
): Promise<string> {
  const m = getModel({ json: false, temperature: opts?.temperature ?? 0.3, model: opts?.model });
  const res = await m.generateContent(prompt);
  logUsage(opts?.label ?? "gemini_text", res);
  return (res.response.text() ?? "").trim();
}

/**
 * Build a function-calling model for the ADR-012 tool loop. The system prompt +
 * tool schemas are the STATIC cached prefix (identical every call, re-sent on every
 * step — so prompt caching pays most here). Thinking is left ON (no thinkingBudget
 * override): unlike the single-shot router/synthesis calls, the loop must *chain*
 * tools, and that reasoning is worth the cents (ADR-012 "pick reliability"). Mutable
 * data (roster/candidates) is NEVER baked into the prefix — it arrives only via tool
 * results — so the cache can't serve stale data.
 */
export function createToolModel(opts: {
  systemInstruction: string;
  functionDeclarations: FunctionDeclaration[];
  model?: string;
  temperature?: number;
}): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: opts.model ?? AGENT_MODEL,
    systemInstruction: opts.systemInstruction,
    tools: [{ functionDeclarations: opts.functionDeclarations }],
    generationConfig: { temperature: opts.temperature ?? 0 } as unknown as Record<string, unknown>,
  });
}

/** Cost logging for tool-loop steps — the chat `sendMessage` result carries the
 *  same `usageMetadata` shape, so per-turn loop cost stays MEASURED (ADR-011). */
export function logGeminiUsage(label: string, result: UsageResult): void {
  logUsage(label, result);
}
