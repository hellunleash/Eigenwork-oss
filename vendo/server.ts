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
 * The import is kept because the opt-in escape hatch below builds a model from
 * it. It is NOT the fix — it was tried, deployed and did not work.
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

/**
 * DEFAULT: STOCK VENDO. No `models` block, so Vendo's own credential ladder
 * runs exactly as shipped. That is deliberate — this install exists to observe
 * how Vendo behaves for a real third-party host, and a patched install proves
 * nothing about the product.
 *
 * The escape hatch below is OPT-IN (`VENDO_FORCE_EXPLICIT_MODEL=1`) and off
 * everywhere by default. It hands Vendo a model object built from a statically
 * imported provider, skipping runtime resolution entirely. Turn it on only to
 * unblock a demo, and remember that it also disables Vendo's mini -> full
 * escalation — the escalation that produces the reasoning items behind the
 * dead-thread bug, so a pinned install cannot reproduce it.
 *
 * WHY THE STOCK PATH FAILS ON VERCEL, for the record:
 *
 *   if (credential.rung === "env-key")     -> BYO provider (@ai-sdk/openai)
 *   if (credential.rung === "vendo-cloud") -> @ai-sdk/anthropic via the gateway
 *
 * The BYO rung is checked first, and OPENAI_API_KEY is set in this app's
 * environment for the ETI scorer — nothing to do with Vendo. So the ladder
 * takes the BYO rung and never reaches the Cloud rung, even though VENDO_API_KEY
 * is present and would have worked: @ai-sdk/anthropic is a dependency of Vendo
 * itself and resolves from Vendo's own node_modules. The BYO rung is the only
 * one that must find a package inside the HOST app, which is precisely what a
 * bundled serverless function cannot do — it resolves a path at runtime
 * (createRequire + require.resolve + pathToFileURL) and Next traces files by
 * static imports.
 *
 * A static import and `serverExternalPackages` were both tried, deployed, and
 * verified against live build ids. Neither fixed it. The two configurations
 * that DO work are: unset OPENAI_API_KEY here so the Cloud rung is reached, or
 * set VENDO_FORCE_EXPLICIT_MODEL=1 and accept a pinned model.
 */
const forceExplicitModel = process.env.VENDO_FORCE_EXPLICIT_MODEL === "1";
const agentModelId = process.env.VENDO_MODEL?.trim() || "gpt-5";
const paintModelId = process.env.VENDO_MODEL_PAINT?.trim() || "gpt-5-mini";

export const vendo = createVendo({
  policy: "cautious",
  principal: resolvePrincipal,
  ...(forceExplicitModel && {
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
