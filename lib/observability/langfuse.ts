import { LangfuseSpanProcessor } from "@langfuse/otel";
import { log } from "@/lib/server-logger";

/**
 * Langfuse OTel span processor — the export seam for LLM observability.
 *
 * Why this lives in its own module rather than inline in `instrumentation.ts`:
 * the processor handle is needed in TWO places — once at boot to register it
 * with OTel, and again per-request to force a flush before a serverless
 * function is frozen. A module-level singleton is the only way both callers
 * get the same instance.
 *
 * Scope: this traces the **Vendo** agent loop (in-app customization surface),
 * which runs on the Vercel AI SDK and emits OTel GenAI spans natively. The
 * Slack agent keeps its own tracer (`lib/agent/trace.ts` -> `agent_traces`);
 * the two are deliberately independent so wiring this one can never regress
 * the other.
 *
 * Best-effort, exactly like the Slack tracer: absent credentials disable
 * tracing rather than throwing. An observability failure must NEVER break the
 * turn it is watching.
 */

const enabled =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY) && Boolean(process.env.LANGFUSE_SECRET_KEY);

let processor: LangfuseSpanProcessor | null = null;

/** The singleton processor, or null when credentials are absent. */
let constructionFailed = false;

export function getLangfuseProcessor(): LangfuseSpanProcessor | null {
  if (!enabled || constructionFailed) return null;
  if (processor == null) {
    // The header above promised "an observability failure must NEVER break the
    // turn it is watching" and the code did not enforce it: this constructor
    // can throw, `register()` did not catch, and a throw inside Next's
    // instrumentation hook fails the SERVER — every route, including ones that
    // have nothing to do with tracing. That is exactly what happened in prod
    // the moment the Langfuse credentials were set: /api/jd/list AND /api/kpi
    // both 500'd. Tracing is now strictly opt-out-on-failure.
    try {
      processor = new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
      });
    } catch (err) {
      constructionFailed = true;
      log("error", "langfuse.processor_construction_failed", {}, err);
      return null;
    }
  }
  return processor;
}

export function isLangfuseEnabled(): boolean {
  return enabled;
}

/**
 * Flush pending spans before the runtime freezes the process.
 *
 * THIS IS NOT OPTIONAL ON VERCEL. OTel batches span exports; a serverless
 * function is suspended the moment its response is sent, so a batch that has
 * not left the process is lost silently — you get an empty Langfuse dashboard
 * and no error anywhere. Call this from `after()` in every route that runs an
 * agent turn.
 */
export async function flushLangfuse(): Promise<void> {
  const p = getLangfuseProcessor();
  if (p == null) return;
  try {
    await p.forceFlush();
  } catch (err) {
    log("warn", "langfuse.flush_failed", {}, err);
  }
}
