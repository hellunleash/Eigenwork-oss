import { createVendo } from "@vendoai/vendo/server";
import type { Principal } from "@vendoai/core";
import * as openaiProvider from "@ai-sdk/openai";
import { requireOrgMember } from "@/lib/org";

/**
 * ⚠ THIS IMPORT IS LOAD-BEARING AND MUST NOT BE "CLEANED UP".
 *
 * Vendo's credential ladder loads the provider at RUNTIME, by resolved path:
 *
 *   const require = createRequire(join(root, "package.json"));
 *   return await dynamicImport(pathToFileURL(require.resolve(specifier)).href);
 *
 * Next traces which files a serverless function needs by following STATIC
 * imports. Nothing in this app imported `@ai-sdk/openai` statically, so it was
 * never bundled into the deployed function — and the runtime resolve threw. The
 * ladder catches any failure and reports `"OPENAI_API_KEY is set but
 * @ai-sdk/openai is not installed in this app"`, which is wrong in the way that
 * costs the most time: the package IS installed, it just was not deployed.
 * Local dev has a real node_modules on disk, so it only fails in production.
 *
 * The namespace is now genuinely USED below (the Vercel branch builds a model
 * from it), so nothing can tree-shake it out. Kept static and explicit for the
 * same reason: resolution must never be left until runtime.
 */

/**
 * The Vendo instance for EigenWork's in-app customization surface.
 *
 * NOTE ON AUTH — no `auth:` preset. `vendo init` scaffolds `auth: authJs()`
 * because its auto-detect reads package.json and we run Firebase Admin, not
 * Auth.js. `auth` and `principal` are MUTUALLY EXCLUSIVE (mixing throws
 * VendoError("validation") at compose time), so we take the `principal`
 * escape hatch and resolve the caller through our own authz layer.
 *
 * Auth therefore stays in exactly one place — `requireOrgMember` — which is
 * the invariant the whole security posture rests on. The resolver below is the
 * ONLY place a Vendo session learns who it is; `orgId` is never read from
 * client or model input. Same rule as the Slack agent (ADR-012).
 *
 * `policy: "cautious"` is the preset that asks before write/destructive and
 * runs read — the propose-only write contract, expressed in Vendo's own terms
 * rather than reimplemented.
 *
 * No `models` block: unset, Vendo's credential ladder resolves the provider
 * key from the environment (OPENAI_API_KEY). The BYO agent route passes its
 * own model to `streamText` directly, so this only feeds Vendo's internal app
 * generation lane.
 */

/**
 * On Vercel we hand Vendo a BUILT MODEL; locally we let its ladder resolve one.
 *
 * Vendo's ladder loads the provider by resolving a path at runtime. That cannot
 * be made to work inside a bundled serverless function: a static import gets the
 * package traced into the deployment, `serverExternalPackages` stops it being
 * inlined, and it STILL failed in prod with "OPENAI_API_KEY is set but
 * @ai-sdk/openai is not installed in this app". Both were deployed and verified
 * against live build ids before giving up on them.
 *
 * An explicit model object skips resolution entirely — the provider is imported
 * statically, right here, the ordinary way. `models.agent` takes a
 * `string | LanguageModel`, and an explicit object is the highest-precedence
 * tier in `resolveModels`, so nothing is left to discover at runtime.
 *
 * ⚠ WHY IT IS GATED ON `VERCEL` RATHER THAN APPLIED EVERYWHERE. Pinning a model
 * disables Vendo's own mini -> full escalation, and that escalation is what
 * produces the OpenAI Responses reasoning items behind the dead-thread bug we
 * are still trying to reproduce. Pinning globally would silently delete the
 * behaviour under test — which already happened once with VENDO_MODEL. So prod
 * gets the model that works, local dev keeps the ladder that reproduces the bug.
 */
const onVercel = process.env.VERCEL === "1";
const agentModelId = process.env.VENDO_MODEL?.trim() || "gpt-5";
const paintModelId = process.env.VENDO_MODEL_PAINT?.trim() || "gpt-5-mini";

export const vendo = createVendo({
  policy: "cautious",
  principal: resolvePrincipal,
  ...(onVercel && {
    models: {
      agent: openaiProvider.openai(agentModelId),
      paint: openaiProvider.openai(paintModelId),
    },
  }),
});

/**
 * Host session -> Vendo principal. Fails CLOSED: an unauthenticated or
 * non-member caller resolves to `null`, which Vendo treats as the ephemeral
 * anonymous principal — never a member of any org, so no org-scoped tool can
 * return anything. It does not fall back to a "default" user.
 */
async function resolvePrincipal(req: Request): Promise<Principal | null> {
  const ctx = await requireOrgMember(req.headers);
  if (!ctx.ok) return null;
  return { kind: "user", subject: ctx.userId };
}

export type ResolvedActor =
  | { ok: true; principal: Principal; orgId: string; userId: string }
  | { ok: false; status: number; error: string };

/**
 * The BYO-agent route's resolver — same gate as `resolvePrincipal`, but it
 * also hands back `orgId` so the route can scope tool results and stamp
 * Langfuse telemetry metadata with the tenant. Returns the failure status
 * instead of collapsing to anonymous, so the route can reject outright.
 */
export async function resolveVendoActor(headers: Headers): Promise<ResolvedActor> {
  const ctx = await requireOrgMember(headers);
  if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.error };

  return {
    ok: true,
    principal: { kind: "user", subject: ctx.userId },
    orgId: ctx.orgId,
    userId: ctx.userId,
  };
}
