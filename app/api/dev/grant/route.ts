import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { ensurePersonalOrg } from "@/lib/org";
import { grantPass } from "@/lib/entitlements";
import { getRequestId, log } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_GRANT_SECRET ?? "";

/**
 * POST /api/dev/grant — body { secret, email, kind? }
 *
 * Dev/admin tool: grants a plan pass (team | single_role | free) to the org
 * owned by `email`, reusing the real grantPass(). Gated by ADMIN_GRANT_SECRET;
 * if that env var is unset the route 404s (disabled). Remove the env var to
 * turn it off for production. Lets you self-provision Team for testing without
 * paying — and doubles as a live check that grantPass works.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/dev/grant";
  try {
    if (!ADMIN_SECRET) return NextResponse.json({ error: "disabled" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    if (typeof body.secret !== "string" || body.secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const email = typeof body.email === "string" ? body.email : "";
    if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
    const kind = body.kind === "single_role" ? "single_role" : body.kind === "free" ? "free" : "team";

    const user = await getAdminAuth().getUserByEmail(email);
    const orgId = await ensurePersonalOrg(user.uid);
    const passId = await grantPass(orgId, kind);

    log("info", "dev.grant", { requestId, route, orgId, kind });
    return NextResponse.json({ ok: true, orgId, kind, passId });
  } catch (err) {
    log("error", "dev.grant_failed", { requestId, route }, err);
    return NextResponse.json({ error: "grant_failed" }, { status: 500 });
  }
}
