import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "@/lib/server-logger";

/**
 * Thin Gemini 2.5 Flash helpers for the agent (ADR-010 Phase 2).
 *
 * Reuses the same model the match role-fit classifier uses (one provider, the
 * GEMINI_API_KEY already in env). Thinking is disabled (thinkingBudget=0) for
 * speed/cost — the agent's work is grounded retrieval + re-expression, not deep
 * reasoning. `geminiJson` returns null on a parse failure so callers can degrade.
 *
 * Every call logs `agent.gemini_usage` with the real token counts (Gemini's
 * usageMetadata) + the dollar cost at current 2.5 Flash rates — so per-message-kind
 * cost is MEASURED, not estimated (ADR-011 cost basis).
 */

// Gemini 2.5 Flash standard tier, 2026-06-24.
const INPUT_USD_PER_TOKEN = 0.3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 2.5 / 1_000_000;

function logUsage(label: string, result: { response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } } }): void {
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
function getModel(opts: { json: boolean; temperature: number }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as Record<string, unknown>,
  });
}

export async function geminiJson<T>(
  prompt: string,
  opts?: { temperature?: number; label?: string }
): Promise<T | null> {
  const m = getModel({ json: true, temperature: opts?.temperature ?? 0 });
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
  opts?: { temperature?: number; label?: string }
): Promise<string> {
  const m = getModel({ json: false, temperature: opts?.temperature ?? 0.3 });
  const res = await m.generateContent(prompt);
  logUsage(opts?.label ?? "gemini_text", res);
  return (res.response.text() ?? "").trim();
}
