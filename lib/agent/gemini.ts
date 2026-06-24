import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Thin Gemini 2.5 Flash helpers for the agent (ADR-010 Phase 2).
 *
 * Reuses the same model the match role-fit classifier uses (one provider, the
 * GEMINI_API_KEY already in env). Thinking is disabled (thinkingBudget=0) for
 * speed/cost — the agent's work is grounded retrieval + re-expression, not deep
 * reasoning. `geminiJson` returns null on a parse failure so callers can degrade.
 */
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

export async function geminiJson<T>(prompt: string, opts?: { temperature?: number }): Promise<T | null> {
  const m = getModel({ json: true, temperature: opts?.temperature ?? 0 });
  const res = await m.generateContent(prompt);
  const raw = (res.response.text() ?? "").trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function geminiText(prompt: string, opts?: { temperature?: number }): Promise<string> {
  const m = getModel({ json: false, temperature: opts?.temperature ?? 0.3 });
  const res = await m.generateContent(prompt);
  return (res.response.text() ?? "").trim();
}
