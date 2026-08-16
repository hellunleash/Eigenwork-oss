/**
 * Next.js instrumentation hook — runs once per runtime at boot.
 *
 * Registers the Langfuse span processor so OTel GenAI spans (emitted by the
 * Vercel AI SDK when a call passes `experimental_telemetry`) export to
 * Langfuse. See `lib/observability/langfuse.ts` for the flush contract.
 *
 * ⚠ THE IMPORTS ARE DYNAMIC ON PURPOSE. This module is evaluated on the EDGE
 * runtime as well as node, and the Langfuse/OTel chain reaches `server-logger`
 * -> node `crypto`, which edge cannot load. A static import fails there even
 * though `register()` returns early, because the import is hoisted and
 * evaluated before the guard ever runs ("A Node.js module is loaded ('crypto')
 * which is not supported in the Edge Runtime"). Importing after the guard keeps
 * the edge bundle clean.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ⚠ THE WHOLE BODY IS INSIDE A CATCH, and that is the point.
  //
  // A throw in this hook fails the SERVER, not just tracing: Next awaits
  // `register()` at boot, so an unhandled rejection here takes down every route
  // in the app. It did. Minutes after the Langfuse credentials were set in
  // production, `/api/jd/list` and `/api/kpi` — a route with no connection to
  // any of this — both returned 500, and the pipeline page showed "An error
  // occurred while fetching the data."
  //
  // Observability is the least important thing running in this process. It is
  // never allowed to be the reason the product is down. If any part of the
  // chain fails, we log it and serve the app untraced.
  try {
    const { registerOTel } = await import("@vercel/otel");
    const { getLangfuseProcessor } = await import("@/lib/observability/langfuse");

    const processor = getLangfuseProcessor();
    if (processor == null) {
      console.log("[otel] register(): SKIPPED — no processor (credentials absent or construction failed)");
      return;
    }

    registerOTel({
      serviceName: "eigenwork",
      spanProcessors: [processor],
    });
    console.log("[otel] register(): Langfuse span processor registered");
  } catch (err) {
    console.error("[otel] register(): FAILED — continuing without tracing", err);
  }
}
