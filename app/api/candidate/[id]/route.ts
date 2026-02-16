import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/candidate/[id] — returns the candidate document for dashboard display */
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const db = getAdminDb();
    const snap = await db.collection("candidates").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    return NextResponse.json({ id: snap.id, ...snap.data() });
  } catch (err) {
    console.error("Candidate get error:", err);
    return NextResponse.json(
      { error: "Failed to load candidate", details: String(err) },
      { status: 500 }
    );
  }
}
