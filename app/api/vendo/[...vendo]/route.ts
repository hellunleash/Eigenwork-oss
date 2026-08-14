import { nextVendoHandler } from "@vendoai/vendo/server";
import { vendo } from "@/vendo/server";
import { requireOrgMember } from "@/lib/org";
import { tracedWire } from "@/lib/observability/vendo-trace";

/**
 * Vendo's wire protocol — the endpoint <VendoProvider baseUrl="/api/vendo">
 * talks to (sessions, apps, approvals, streaming, theme).
 *
 * ⚠ WHY THE AUTH WRAPPER EXISTS. The `principal` resolver in `vendo/server.ts`
 * is NOT a gate. Returning `null` from it does not reject the request — Vendo
 * reads null as "use the ephemeral anonymous principal" and serves the turn
 * anyway. Verified locally: an unauthenticated POST to /api/vendo/threads got
 * past auth and failed at message validation (400), not at the door (401).
 *
 * For a public deployment that is an unauthenticated compute path: a stranger
 * can drive agent turns and spend our model budget. So every wire request is
 * gated here, BEFORE Vendo sees it, and the resolver downgrade becomes
 * defence-in-depth rather than the only control.
 *
 * TELEMETRY. Two lanes, and both are now covered:
 *   - MODEL calls (the agent's own turns, app generation, repair) emit GenAI
 *     spans because `patches/@vendoai+{agent,apps}` pass
 *     `experimental_telemetry`. Upstream 0.7.x/0.8.0 does not — that omission is
 *     runvendo/vendo#1067, and the patch is applied by a `postinstall` hook so
 *     it survives Vercel's clean install.
 *   - WIRE calls (a generated app calling a tool as it renders) are NOT model
 *     calls and never appear in a GenAI span. `tracedWire` covers them, which is
 *     the only way to see the arguments an app actually spent and the errors it
 *     turned into confident empty states.
 * Both honour `VENDO_OTEL_TRACING` (unset/1 = with payloads, `metrics` = without,
 * `0` = off). Measured by `npm run qa:vendo:telemetry`.
 */

const handlers = nextVendoHandler(vendo);

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

function gated(inner: Handler): Handler {
  return async (req, ctx) => {
    const auth = await requireOrgMember(req.headers);
    if (!auth.ok) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }
    // The span is opened INSIDE the gate so a rejected stranger never creates
    // one, and so the actor it labels is always a resolved member.
    return tracedWire(inner as (req: Request, ctx: never) => Promise<Response>, () => ({
      orgId: auth.orgId,
      userId: auth.userId,
    }))(req, ctx as never);
  };
}

export const GET = gated(handlers.GET as Handler);
export const POST = gated(handlers.POST as Handler);
export const PUT = gated(handlers.PUT as Handler);
export const PATCH = gated(handlers.PATCH as Handler);
export const DELETE = gated(handlers.DELETE as Handler);
