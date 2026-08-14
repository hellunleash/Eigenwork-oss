/**
 * Tracing for the Vendo WIRE, which is a different lane from the model calls.
 *
 * There are two kinds of "tool call" in a Vendo install and only one of them is
 * a model call:
 *
 *   1. The AGENT decides to call a tool during a chat turn. That is an AI-SDK
 *      call, so `experimental_telemetry` (patches/@vendoai+agent) puts it in
 *      Langfuse with the tool name and arguments the model chose.
 *   2. A GENERATED APP calls a tool while it renders — `tools.jd_match({...})`
 *      from inside the jail. No model is involved: the island posts over the
 *      bridge, the host executes the tool, the result comes back. The AI SDK
 *      never sees it, so NO GenAI span exists however the patch is configured.
 *
 * Lane 2 is where the interesting failures live. A generated app called
 * `GET /api/jd/match` with no `jobId`, got a 400, and rendered "no candidates"
 * as though the answer were empty — and none of it was in Langfuse, because the
 * call was never a model call. The parameters were chosen at GENERATION time
 * (by a model reading a tool schema that had no query params in it) and spent at
 * RENDER time, which is why the two halves have to be correlated to debug it.
 *
 * This span is the second half: what the app actually called, with what
 * arguments, and what came back.
 *
 * Payload recording follows the same switch as the model patch —
 * `VENDO_OTEL_TRACING`: unset/`1`/`true` records bodies, `metrics` records only
 * shape and status, `0`/`false` disables the span entirely. Bodies here can
 * carry candidate data, so prod can drop to `metrics` without a redeploy.
 */
import { SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER = "eigenwork.vendo-bridge";
/** Bodies are evidence, not archives — enough to see the arguments and the
 *  error, never enough to mirror a candidate record into the tracer. */
const MAX_BODY_CHARS = 4_000;

type Mode = "off" | "full" | "metrics";

function mode(): Mode {
  switch (process.env.VENDO_OTEL_TRACING) {
    case "0":
    case "false":
      return "off";
    case "metrics":
      return "metrics";
    default:
      return "full";
  }
}

function clip(text: string): string {
  return text.length <= MAX_BODY_CHARS ? text : `${text.slice(0, MAX_BODY_CHARS)}…[clipped]`;
}

/** A streamed turn must never be buffered to be traced — reading it here would
 *  hold the whole agent response before the client saw a token. Only small,
 *  self-contained JSON is read back. */
function isReadableJson(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return false;
  const length = Number(response.headers.get("content-length") ?? "0");
  return length > 0 && length <= MAX_BODY_CHARS * 2;
}

export interface WireActor {
  orgId?: string;
  userId?: string;
}

/**
 * Wrap a wire handler so every request becomes one span.
 *
 * Never changes the response: on any failure of its own it returns the handler's
 * result untouched. Tracing that can break the product is worse than no tracing.
 */
export function tracedWire<T extends (req: Request, ctx: never) => Promise<Response>>(
  handler: T,
  actor?: () => WireActor,
): T {
  const wrapped = async (req: Request, ctx: never): Promise<Response> => {
    if (mode() === "off") return handler(req, ctx);

    const url = new URL(req.url);
    // The wire path after /api/vendo — "threads", "apps/<id>/call", etc. It is
    // the closest thing the bridge has to an operation name.
    const operation = url.pathname.replace(/^\/api\/vendo\/?/, "") || "root";
    const tracer = trace.getTracer(TRACER);

    return tracer.startActiveSpan(`vendo.wire ${req.method} ${operation}`, async (span) => {
      const started = Date.now();
      try {
        span.setAttribute("vendo.wire.operation", operation);
        span.setAttribute("http.request.method", req.method);
        if (url.search !== "") span.setAttribute("url.query", url.search);

        const who = actor?.();
        if (who?.orgId !== undefined) span.setAttribute("vendo.org_id", who.orgId);
        if (who?.userId !== undefined) span.setAttribute("vendo.user_id", who.userId);

        // Read the request body from a CLONE: the handler still needs the
        // original stream intact.
        let forwarded = req;
        if (req.method !== "GET" && req.method !== "HEAD" && req.body !== null) {
          try {
            const body = await req.clone().text();
            span.setAttribute("vendo.wire.request_bytes", body.length);
            if (mode() === "full" && body !== "") {
              span.setAttribute("vendo.wire.request_body", clip(body));
            }
          } catch {
            // An unclonable body is not a reason to fail the request.
            forwarded = req;
          }
        }

        const response = await handler(forwarded, ctx);
        span.setAttribute("http.response.status_code", response.status);
        span.setAttribute("vendo.wire.duration_ms", Date.now() - started);

        if (response.status >= 400) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `wire ${response.status}` });
        }

        // The result body is where a tool's own failure shows up — a 200 wire
        // response can carry a 400 from the host route the tool called, which is
        // exactly the case that rendered a confident empty state.
        if (mode() === "full" && isReadableJson(response)) {
          try {
            const text = await response.clone().text();
            span.setAttribute("vendo.wire.response_body", clip(text));
          } catch {
            // ignore — the response still goes back untouched
          }
        }
        return response;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  };
  return wrapped as T;
}
