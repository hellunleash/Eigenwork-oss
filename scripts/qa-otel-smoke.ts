/**
 * Smoke test: does a Langfuse-registered OTel provider capture an AI SDK call
 * AT ALL, outside Next?
 *
 *   npx tsx scripts/qa-otel-smoke.ts
 *
 * Run this when the telemetry A/B comes back "neither path traced". It strips
 * away Next, Turbopack, the route layer and Vendo, leaving only: NodeSDK +
 * LangfuseSpanProcessor + one `streamText` with `experimental_telemetry`.
 *
 *   traces here, none in the app  -> the Next/Turbopack instrumentation seam is
 *                                    the problem, not the SDK or the keys
 *   no traces here either         -> credentials, region, or egress
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { LangfuseSpanProcessor } = await import("@langfuse/otel");
  const { streamText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";
  if (!publicKey || !secretKey) {
    console.error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY required");
    process.exit(1);
  }

  const marker = `otel-smoke-${Date.now()}`;
  const processor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl });
  const sdk = new NodeSDK({ spanProcessors: [processor] });
  sdk.start();
  console.log(`  NodeSDK started, exporting to ${baseUrl}`);

  const result = streamText({
    model: openai("gpt-5.4"),
    prompt: `Reply with exactly this word and nothing else: ${marker}`,
    experimental_telemetry: { isEnabled: true, functionId: "otel-smoke" },
  });
  let text = "";
  for await (const chunk of result.textStream) text += chunk;
  console.log(`  model replied: ${text.trim().slice(0, 80)}`);

  await processor.forceFlush();
  await sdk.shutdown();
  console.log("  flushed + shut down");

  // Read it back rather than asking the operator to eyeball a dashboard.
  await new Promise((r) => setTimeout(r, 4000));
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const since = new Date(Date.now() - 300_000).toISOString();
  const res = await fetch(
    `${baseUrl}/api/public/traces?fromTimestamp=${encodeURIComponent(since)}&limit=100`,
    { headers: { authorization: `Basic ${auth}` } }
  );
  const body = await res.text();

  console.log(`\n  langfuse read: HTTP ${res.status}`);
  console.log(`  smoke trace present: ${body.includes(marker) ? "YES" : "NO"}`);
  if (!body.includes(marker)) {
    console.log(
      "\n  Standalone tracing does not work either -> the problem is credentials,\n" +
        "  region (check LANGFUSE_BASE_URL matches the keys' project), or egress.\n" +
        "  Fix this before drawing any conclusion about Vendo."
    );
    process.exit(1);
  }
  console.log(
    "\n  Standalone tracing WORKS. If the in-app A/B still traces nothing, the\n" +
      "  fault is the Next instrumentation seam, not the SDK, keys, or Vendo."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
