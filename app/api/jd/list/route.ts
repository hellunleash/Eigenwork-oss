import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Returns the user's pipelines with submissionCap, isClosed, appliedCount.
 * appliedCount = candidates where matchData.jobId == jobId and status === "submitted".
 * Requires ?userId=<firebase_uid> so each user only sees their own pipelines.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "Missing userId", pipelines: [] }, { status: 400 });
    }
    const uid = userId.trim();
    const db = getAdminDb();

    const jdsSnap = await db.collection("jds").where("userId", "==", uid).get();
    const pipelines = await Promise.all(
      jdsSnap.docs.map(async (d) => {
        const data = d.data();
        const jobId = d.id;
        const rawCap = typeof data.submissionCap === "number" ? data.submissionCap : parseInt(String(data.submissionCap), 10);
        const submissionCap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 10;
        const isClosed = Boolean(data.isClosed);

        const candSnap = await db
          .collection("candidates")
          .where("matchData.jobId", "==", jobId)
          .where("status", "==", "submitted")
          .get();
        const appliedCount = candSnap.size;

        const createdAt = data.createdAt as { toMillis?: () => number } | null;
        const matchResult = data.matchResult as { top10?: unknown[]; completedAt?: unknown } | undefined;
        const hasMatchResult = Boolean(matchResult?.top10 && Array.isArray(matchResult.top10) && matchResult.top10.length > 0);
        return {
          id: jobId,
          title: data.title ?? "",
          createdAt: createdAt?.toMillis?.() ?? null,
          submissionCap,
          isClosed,
          appliedCount,
          hasMatchResult,
        };
      })
    );
    pipelines.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ pipelines });
  } catch (err) {
    console.error("JD list error:", err);
    return NextResponse.json(
      { error: "Failed to load pipelines", details: String(err) },
      { status: 500 }
    );
  }
}
