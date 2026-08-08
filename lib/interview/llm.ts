/**
 * Thin JSON-model call for the interview module (Phase 2).
 *
 * Deliberately wraps the SHARED `runJsonModel` primitive (no fork of the OpenAI
 * call) rather than the eval runner's private `safeGenerate` — that helper is
 * coupled to the scoring engine's LogContext + flex constants, and importing it
 * would pull the whole prod scorer into this isolated module. One flex attempt
 * (~50% cheaper, free on a 429 capacity miss) then a standard fallback.
 *
 * Cost note: token counts are returned exact; per-eval USD + entitlement metering
 * land in the dedicated metering slice (M1), not here.
 */
import { runJsonModel } from "@/lib/openai-client";

export type InterviewLlmResult = {
  json: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
};

/** Parse a JSON object from model text, tolerating stray prose around it. */
export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e > s) {
      try {
        return JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    throw new Error("interview LLM returned non-JSON output");
  }
}

export async function runInterviewJson(
  prompt: string,
  maxOutputTokens = 4000,
  opts: { interactive?: boolean } = {}
): Promise<InterviewLlmResult> {
  // Interactive (candidate-facing, someone is waiting) → standard tier only: it
  // schedules immediately. Background (invite-time generation) → flex first
  // (~50% cheaper, free on a 429) then standard fallback.
  const tiers = opts.interactive ? (["default"] as const) : (["flex", "default"] as const);
  let lastErr: unknown;
  for (const tier of tiers) {
    try {
      const r = await runJsonModel(prompt, maxOutputTokens, tier);
      return { json: parseJsonObject(r.text), inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0 };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("runInterviewJson failed");
}
