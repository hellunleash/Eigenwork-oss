import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// --- Process-wide concurrency gate -----------------------------------------
// Every ETI block is one OpenAI call. The worker fans out many candidate
// evaluations at once, and a single junior evaluation now issues its two blocks
// (ESQ + behavioral) concurrently — so without a ceiling, peak in-flight
// requests scale with (eval concurrency × blocks-per-eval) and can trip
// OpenAI's RPM/TPM limits. This bounds simultaneous requests per worker process
// to LLM_MAX_CONCURRENCY (default 16); excess calls queue FIFO rather than fire.
// NOTE: this is per-process — if the worker autoscales to N instances the global
// ceiling is N × LLM_MAX_CONCURRENCY, so size the env relative to your OpenAI tier.
const MAX_INFLIGHT = Math.max(1, Number(process.env.LLM_MAX_CONCURRENCY) || 16);
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_INFLIGHT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next(); // hand the in-use slot straight to the next waiter
  else active--; // no one waiting: free the slot
}

export async function runJsonModel(prompt: string, maxOutputTokens = 10000) {
  await acquire();
  try {
    const res = await openai.responses.create({
      model: "gpt-5.2",
      temperature: 0,
      max_output_tokens: maxOutputTokens,
      text: { format: { type: "json_object" } },
      input: prompt
    });

    const text = res.output_text;
    if (text == null || text === "") {
      const err = (res as { error?: { message?: string } }).error;
      throw new Error(err?.message ?? "Model returned no output");
    }
    return text;
  } finally {
    release();
  }
}