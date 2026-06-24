import { geminiJson } from "@/lib/agent/gemini";
import { hasJargon } from "@/lib/agent/jargon";

/**
 * Judge pass (ADR-010 guardrail 5). A deterministic jargon gate first, then a
 * fast Gemini check that the answer is fully supported by the grounding data and
 * leaks no invented facts or personal contact details. A judge call failure does
 * NOT block (the deterministic gate already ran) — we fail open on the LLM check
 * but closed on jargon.
 */
export type JudgeVerdict = { ok: boolean; reason?: string };

export async function judgeAnswer(question: string, answer: string, grounding: string): Promise<JudgeVerdict> {
  if (hasJargon(answer)) return { ok: false, reason: "internal jargon leaked" };

  const prompt = `You are a strict reviewer for a recruiting assistant. Decide whether the ANSWER is fully supported by the GROUNDING data, invents no facts, and leaks no personal contact details (email/phone). Output ONLY JSON {"ok": true|false, "reason": "short reason"}.

QUESTION: ${question}

GROUNDING (the only allowed source of truth):
${grounding}

ANSWER:
${answer}`;

  const verdict = await geminiJson<JudgeVerdict>(prompt, { temperature: 0, label: "judge" });
  if (!verdict || typeof verdict.ok !== "boolean") return { ok: true };
  return verdict;
}
