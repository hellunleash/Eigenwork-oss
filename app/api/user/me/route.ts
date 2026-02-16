import { NextRequest, NextResponse } from "next/server";
import { getUserProfile } from "@/lib/user-credits";

/**
 * GET /api/user/me — returns the current user's profile (eigenCredits).
 * Query: ?userId=<firebase_uid>
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }
    const profile = await getUserProfile(userId.trim());
    return NextResponse.json({ eigenCredits: profile.eigenCredits });
  } catch (err) {
    console.error("User me error:", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
