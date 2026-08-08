import { createVendo } from "@vendoai/vendo/server";
import type { Principal } from "@vendoai/core";
import { requireOrgMember } from "@/lib/org";

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

export const vendo = createVendo({
  policy: "cautious",
  principal: resolvePrincipal,
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
