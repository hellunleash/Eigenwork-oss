import { nextVendoHandler } from "@vendoai/vendo/server";
import { vendo } from "@/vendo/server";
import { requireOrgMember } from "@/lib/org";

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
 * ⚠ TELEMETRY GAP (upstream, @vendoai/agent 0.7.x-0.8.0): turns served by THIS
 * handler produce no Langfuse spans — Vendo's loop calls the AI SDK without
 * `experimental_telemetry`, so the processor registered in
 * `instrumentation.ts` never sees a GenAI span, silently. Traced turns go
 * through `app/api/vendo-agent`. Measured by `npm run qa:vendo:telemetry`.
 */

const handlers = nextVendoHandler(vendo);

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

function gated(inner: Handler): Handler {
  return async (req, ctx) => {
    const auth = await requireOrgMember(req.headers);
    if (!auth.ok) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }
    return inner(req, ctx);
  };
}

export const GET = gated(handlers.GET as Handler);
export const POST = gated(handlers.POST as Handler);
export const PUT = gated(handlers.PUT as Handler);
export const PATCH = gated(handlers.PATCH as Handler);
export const DELETE = gated(handlers.DELETE as Handler);
