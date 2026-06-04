import { NextRequest, NextResponse } from "next/server";
import { getUserProfile } from "@/lib/user-credits";
import { requireFirebaseUser } from "@/lib/auth-server";
import { getRequestId, log } from "@/lib/server-logger";

/**
 * GET /api/user/me — returns the current user's profile (eigenCredits).
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req.headers);
  const route = "/api/user/me";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const profile = await getUserProfile(auth.userId);
    return NextResponse.json({ eigenCredits: profile.eigenCredits });
  } catch (err) {
    log("error", "user.me_failed", { requestId, route }, err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
