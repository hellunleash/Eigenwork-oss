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

// Flex processing (service_tier:"flex") bills at Batch API rates (~50% off input
// AND output) and STACKS with prompt caching. A capacity shortfall comes back as a
// 429 and is NOT billed, so flex retries are free. Flex can be slower to schedule,
// so OpenAI recommends a 15-min client timeout; standard stays tight. We disable
// the SDK's own auto-retry (maxRetries:0) so safeGenerate is the single, observable
// retry authority — no hidden extra calls, no surprise billing.
export type ServiceTier = "flex" | "default";
const FLEX_TIMEOUT_MS = 15 * 60 * 1000;
const STD_TIMEOUT_MS = 4 * 60 * 1000;

export type ModelResult = {
  text: string;
  // The tier OpenAI reports it actually BILLED — so the cheap path is auditable,
  // never blind. null if the response doesn't surface it.
  serviceTier: string | null;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
};

export async function runJsonModel(
  prompt: string,
  maxOutputTokens = 10000,
  serviceTier: ServiceTier = "default"
): Promise<ModelResult> {
  await acquire();
  try {
    const res = await openai.responses.create(
      {
        model: "gpt-5.4",
        temperature: 0,
        max_output_tokens: maxOutputTokens,
        text: { format: { type: "json_object" } },
        input: prompt,
        service_tier: serviceTier,
      },
      {
        timeout: serviceTier === "flex" ? FLEX_TIMEOUT_MS : STD_TIMEOUT_MS,
        maxRetries: 0,
      }
    );

    const text = res.output_text;
    if (text == null || text === "") {
      const err = (res as { error?: { message?: string } }).error;
      throw new Error(err?.message ?? "Model returned no output");
    }

    const meta = res as {
      service_tier?: string | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      };
    };
    return {
      text,
      serviceTier: meta.service_tier ?? null,
      inputTokens: meta.usage?.input_tokens,
      cachedTokens: meta.usage?.input_tokens_details?.cached_tokens,
      outputTokens: meta.usage?.output_tokens,
    };
  } finally {
    release();
  }
}