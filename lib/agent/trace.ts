import { randomUUID } from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { log, timeMs } from "@/lib/server-logger";
import type { GeminiUsage } from "@/lib/agent/gemini";

/**
 * Agent tracing (observability). One trace per agent turn (runToolLoop call), with
 * a span per step — scope gate, each LLM call, each tool dispatch, judge/jargon —
 * so a failed/looping/expensive run can be reconstructed after the fact instead of
 * guessed at from a flat log stream. Self-contained on the log()/Firestore infra
 * already used everywhere else here (no new vendor/signup); the OTel GenAI semantic
 * conventions or a hosted APM (Langfuse etc.) are a drop-in upgrade path if usage
 * ever outgrows this.
 *
 * Two outputs per span, both best-effort (a trace failure must NEVER break the
 * turn it's watching):
 *  - an IMMEDIATE structured `agent.trace_span` log line — live step-by-step
 *    visibility in Cloud Run/Vercel logs even if the write below never lands.
 *  - the full trace (spans + rollups) written ONCE, at the end, to
 *    `agent_traces/{traceId}` — durable, queryable (cost/step distributions, tool
 *    error rates) via scripts/diagnose-agent-trace.mjs.
 *
 * Span inputs/outputs are truncated (see snippet()) — this is a debugging aid, not
 * a data store, so a span never carries a full candidate/resume payload.
 */

const SNIPPET_MAX = 300;
const ARG_VALUE_MAX = 200;
const LOOP_WINDOW = 3; // N identical tool calls in a row -> loop flag

export type SpanKind = "scope_gate" | "llm_step" | "tool_call" | "judge" | "jargon_scrub";

export type Span = {
  spanId: string;
  kind: SpanKind;
  name: string;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  model?: string;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  costUsd?: number;
  toolArgs?: Record<string, unknown>;
  output?: string;
  error?: string;
};

export type TraceMeta = {
  orgId: string;
  userId: string;
  surface: "slack";
  teamId?: string;
  channel?: string;
  slackUserId?: string;
  text: string;
};

export type TraceStatus = "help" | "off_topic" | "ok" | "step_cap" | "error";

function snippet(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s == null) return "";
  return s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX)}…(truncated)` : s;
}

/** Shallow-redact tool args for a durable trace: truncate any long string/array so
 *  a full pasted JD or similar never lands whole in a log line or Firestore doc. */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      out[k] = v.length > ARG_VALUE_MAX ? `${v.slice(0, ARG_VALUE_MAX)}…(truncated)` : v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 10);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type SpanHandle = { spanId: string; kind: SpanKind; name: string; startedAt: string; elapsed: () => number };

export class Tracer {
  readonly traceId: string;
  private readonly meta: TraceMeta;
  private readonly spans: Span[] = [];
  private readonly toolCallSignatures: string[] = [];
  private readonly elapsed: () => number;
  private loopFlag = false;

  constructor(meta: TraceMeta) {
    this.traceId = randomUUID();
    this.meta = meta;
    this.elapsed = timeMs();
  }

  /** Start a span; call end() with the same handle when the step completes. */
  start(kind: SpanKind, name: string): SpanHandle {
    return { spanId: randomUUID(), kind, name, startedAt: new Date().toISOString(), elapsed: timeMs() };
  }

  /** Complete a span — records it, logs it immediately, and (for tool_call spans)
   *  checks for a same-action loop. */
  end(
    h: SpanHandle,
    fields: {
      ok: boolean;
      usage?: GeminiUsage;
      model?: string;
      toolArgs?: Record<string, unknown>;
      output?: unknown;
      error?: unknown;
    }
  ): void {
    const span: Span = {
      spanId: h.spanId,
      kind: h.kind,
      name: h.name,
      startedAt: h.startedAt,
      durationMs: h.elapsed(),
      ok: fields.ok,
      ...(fields.model != null && { model: fields.model }),
      ...(fields.usage != null && {
        inputTokens: fields.usage.inputTokens,
        cachedTokens: fields.usage.cachedTokens,
        outputTokens: fields.usage.outputTokens,
        thinkingTokens: fields.usage.thinkingTokens,
        costUsd: fields.usage.costUsd,
      }),
      ...(fields.toolArgs != null && { toolArgs: redactArgs(fields.toolArgs) }),
      ...(fields.output != null && { output: snippet(fields.output) }),
      ...(fields.error != null && { error: snippet(fields.error) }),
    };
    this.spans.push(span);

    if (h.kind === "tool_call") {
      const sig = `${h.name}:${JSON.stringify(span.toolArgs ?? {})}`;
      this.toolCallSignatures.push(sig);
      const recent = this.toolCallSignatures.slice(-LOOP_WINDOW);
      if (recent.length === LOOP_WINDOW && recent.every((s) => s === sig)) {
        this.loopFlag = true;
        log("warn", "agent.trace_loop_detected", { traceId: this.traceId, tool: h.name, times: LOOP_WINDOW });
      }
    }

    log(span.ok ? "info" : "warn", "agent.trace_span", { traceId: this.traceId, ...span });
  }

  /** Write the full trace (spans + rollups) once, at the end. Best-effort — never
   *  throws into the caller. */
  async finish(status: TraceStatus, extra?: { replyPreview?: string }): Promise<void> {
    const llmSpans = this.spans.filter((s) => s.kind === "llm_step" || s.kind === "scope_gate" || s.kind === "judge");
    const toolSpans = this.spans.filter((s) => s.kind === "tool_call");
    const rollup = {
      durationMs: this.elapsed(),
      stepCount: llmSpans.length,
      toolCallCount: toolSpans.length,
      toolErrorCount: toolSpans.filter((s) => !s.ok).length,
      totalInputTokens: sum(llmSpans, "inputTokens"),
      totalCachedTokens: sum(llmSpans, "cachedTokens"),
      totalOutputTokens: sum(llmSpans, "outputTokens"),
      totalThinkingTokens: sum(llmSpans, "thinkingTokens"),
      totalCostUsd: Number(sum(llmSpans, "costUsd").toFixed(6)),
      loopDetected: this.loopFlag,
    };
    log("info", "agent.trace_finish", { traceId: this.traceId, status, ...rollup });
    try {
      await getAdminDb()
        .collection("agent_traces")
        .doc(this.traceId)
        .set({
          orgId: this.meta.orgId,
          userId: this.meta.userId,
          surface: this.meta.surface,
          status,
          text: snippet(this.meta.text),
          ...(this.meta.teamId != null && { teamId: this.meta.teamId }),
          ...(this.meta.channel != null && { channel: this.meta.channel }),
          ...(this.meta.slackUserId != null && { slackUserId: this.meta.slackUserId }),
          ...(extra?.replyPreview != null && { replyPreview: snippet(extra.replyPreview) }),
          ...rollup,
          spans: this.spans,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      log("warn", "agent.trace_write_failed", { traceId: this.traceId }, err);
    }
  }
}

function sum(spans: Span[], key: keyof Span): number {
  return spans.reduce((acc, s) => acc + (typeof s[key] === "number" ? (s[key] as number) : 0), 0);
}

export function startTrace(meta: TraceMeta): Tracer {
  return new Tracer(meta);
}
