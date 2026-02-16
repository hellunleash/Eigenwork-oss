import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Match route: Gemini 2.5 Flash for JD vs Candidate role-fit comparison.
 * 1) Load JD + candidates where matchData.jobId == jobId
 * 2) Role-fit: Gemini compares jd.role_fit one_liner vs candidate.profile.role_fit (MATCH / ADJACENT / NO MATCH)
 * 3) ETI >= 50, work auth (location + employment are enforced at intake)
 * 4) Sort by ETI DESC, return top 10
 */

const ROLE_FIT_PROMPT = `
You are a senior hiring-matching assistant.

You will receive:

JD:
<jd one-liner>

Candidates:
1. <candidate one-liner>
2. <candidate one-liner>
3. <candidate one-liner>
...

Each one-liner is EXACTLY in the format:
"<Title> (Primary | Secondary | Tertiary)"

INTERPRETATION RULES:
- PRIMARY decides the overall functional match.
- SECONDARY can increase confidence but MUST NEVER be the reason for rejection.
- TERTIARY is mostly ignorable and MUST NEVER cause a mismatch.

ROLE-FIT DECISION HIERARCHY (PRIMARY-DRIVEN):
- PRIMARY is the main signal for MATCH vs ADJACENT vs NO MATCH.
- Titles can be fuzzy (e.g., "Backend", "Backend Engineer", "Backend Developer" , or just "Software Engineer" are equivalent).
- Minor wording differences or synonyms MUST NOT cause "NO MATCH".

DOMAIN FAMILIES:
- Treat ML / AI / LLM / NLP / Computer Vision / Data / MLOps as one adjacent family.
  - If JD and candidate are both anywhere in this family, classify at worst as ADJACENT (never NO MATCH for domain only).

HARD NO MATCH CASES (when PRIMARY clearly conflicts and JD primary does NOT list both):
- .NET backend vs Python backend (if the JD primary is only one of them, not both).
- Frontend-only vs ML/Data roles.
- Mobile-only vs ML/Data roles.
- Swift-only vs a JD that explicitly requires both Android and iOS (or vice versa).

CLASSIFICATION LABELS (PER CANDIDATE):
- MATCH: Strong primary alignment with the JD role and tech focus.
- ADJACENT: Reasonably close primary alignment or same domain family; candidate could succeed with minor ramp-up.
- NO MATCH: Fundamental primary role/domain/stack mismatch (do NOT use secondary/tertiary to force a match).

OUTPUT FORMAT:
- For each candidate N, output EXACTLY ONE line:
  "N → MATCH" or "N → ADJACENT" or "N → NO MATCH"
- Use plain text only, no extra commentary, no Markdown, no bullet points.
`;

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function normalizeLocation(s: string): string {
  const t = (s || "").trim().toLowerCase();
  if (t === "on-site" || t === "onsite") return "onsite";
  if (t === "remote") return "remote";
  if (t === "hybrid") return "hybrid";
  return (s || "").trim().toLowerCase();
}

function getJDRoleFitOneLiner(jd: Record<string, unknown>): string {
  const rf = jd.role_fit;
  if (rf != null && typeof rf === "object" && "one_liner" in rf) {
    return String((rf as Record<string, unknown>).one_liner ?? "").trim();
  }
  if (typeof (jd as Record<string, unknown>).role_fit_one_liner === "string") {
    return String((jd as Record<string, unknown>).role_fit_one_liner).trim();
  }
  return "";
}

function getCandidateRoleFitOneLiner(candidate: { profile?: { role_fit?: unknown } }): string {
  const rf = candidate.profile?.role_fit;
  if (typeof rf === "string") return String(rf).trim();
  if (rf != null && typeof rf === "object" && "one_liner" in rf) {
    return String((rf as Record<string, unknown>).one_liner ?? "").trim();
  }
  return "";
}

const roleFitCache = new Map<string, string>();

async function geminiBatchMatch(jdRoleFit: string, candidateOneLiners: string[]): Promise<string[]> {
  if (!jdRoleFit) {
    return candidateOneLiners.map(() => "MATCH");
  }

  const results: (string | undefined)[] = new Array(candidateOneLiners.length).fill(undefined);
  const uncachedIndices: number[] = [];
  const uncachedOneLiners: string[] = [];

  for (let i = 0; i < candidateOneLiners.length; i++) {
    const candidateRoleFit = (candidateOneLiners[i] || "").trim();

    if (!candidateRoleFit) {
      results[i] = "NO MATCH";
      continue;
    }

    const key = `${jdRoleFit}::${candidateRoleFit}`;
    const cached = roleFitCache.get(key);
    if (cached) {
      results[i] = cached;
      continue;
    }

    uncachedIndices.push(i);
    uncachedOneLiners.push(candidateRoleFit);
  }

  if (uncachedOneLiners.length === 0) {
    return results.map((r) => (r ?? "NO MATCH"));
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0,
      topK: 1,
      topP: 1,
    },
  });

  let prompt = `${ROLE_FIT_PROMPT}

JD:
${jdRoleFit}

Candidates:
`;

  uncachedOneLiners.forEach((line, idx) => {
    const displayIndex = idx + 1;
    prompt += `${displayIndex}. ${line}\n`;
  });

  const result = await model.generateContent(prompt);
  const raw = result.response.text() ?? "";

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const normalizedResults: ("MATCH" | "ADJACENT" | "NO MATCH")[] = new Array(uncachedOneLiners.length).fill("NO MATCH");

  for (const line of lines) {
    const match = line.match(/^(\d+)\s*→\s*(MATCH|ADJACENT|NO MATCH)/i);
    if (!match) continue;

    const idx = Number(match[1]) - 1;
    if (idx < 0 || idx >= uncachedOneLiners.length) continue;

    const label = match[2].toUpperCase() as "MATCH" | "ADJACENT" | "NO MATCH";
    normalizedResults[idx] = label;
  }

  for (let i = 0; i < uncachedIndices.length; i++) {
    const originalIndex = uncachedIndices[i];
    const candidateRoleFit = uncachedOneLiners[i];
    const label = normalizedResults[i] ?? "NO MATCH";

    const key = `${jdRoleFit}::${candidateRoleFit}`;
    roleFitCache.set(key, label);
    results[originalIndex] = label;
  }

  return results.map((r) => (r ?? "NO MATCH"));
}

function workAuthMatch(
  jobAuth: { us_required?: boolean; eu_required?: boolean; provided?: boolean },
  jobLocationTypes: string[],
  candidateAuthRegions: string[] | undefined
): boolean {
  if (jobAuth?.provided) return true;
  const regions = toArray(candidateAuthRegions).map((r) => String(r).toLowerCase());
  const hasRemoteGlobal = regions.some((r) => r.includes("remote") && r.includes("global"));
  if (hasRemoteGlobal) {
    const job = jobLocationTypes.map(normalizeLocation);
    if (!job.includes("remote")) return false;
  }
  if (jobAuth?.us_required && !regions.some((r) => r.includes("us"))) return false;
  if (jobAuth?.eu_required && !regions.some((r) => r.includes("eu"))) return false;
  return true;
}

type CandidateDoc = {
  id: string;
  score?: number;
  yoe?: number;
  is_matchable?: boolean;
  profile?: { role_fit?: unknown; [k: string]: unknown };
  matchData?: {
    jobId?: string;
    workTypes?: string[] | string;
    locations?: string[] | string;
    authRegions?: string[] | string;
  };
  candidateName?: string;
  email?: string;
  experienceLevel?: string;
  breakdown?: unknown;
  resumeUrl?: string;
  resume_url?: string;
  [k: string]: unknown;
};

async function runMatch(jdId: string): Promise<{ success: boolean; top10?: unknown[]; error?: string }> {
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jdId).get();
  if (!snap.exists) {
    return { success: false, error: "Job not found" };
  }
  const jd = { id: snap.id, ...snap.data() } as Record<string, unknown>;

  const cached = jd.matchResult as { top10?: unknown[] } | undefined;
  if (cached?.top10 && Array.isArray(cached.top10)) {
    const enriched = await Promise.all(
      (
        cached.top10 as {
          id: string;
          candidateName?: string;
          email?: string;
          phone?: string | null;
          yoe?: number;
        }[]
      ).map(async (item) => {
        try {
          const candSnap = await db.collection("candidates").doc(item.id).get();
          if (!candSnap.exists) return item;
          const d = candSnap.data();
          return {
            ...item,
            candidateName: d?.candidateName ?? item.candidateName ?? "",
            email: d?.email ?? item.email ?? "",
            phone: d?.phone ?? item.phone ?? null,
            yoe: d?.yoe ?? item.yoe,
          };
        } catch {
          return item;
        }
      })
    );
    return { success: true, top10: enriched };
  }

  const jdRoleFitOneLiner = getJDRoleFitOneLiner(jd);
  const jobLocationTypes = toArray(jd.location_type).map(String).map(normalizeLocation).filter(Boolean);
  const jobAuth = (jd.work_auth_requirement as Record<string, boolean> | undefined) ?? {};

  const candidatesSnap = await db.collection("candidates").where("matchData.jobId", "==", jdId).get();
  let list: CandidateDoc[] = [];
  candidatesSnap.docs.forEach((d) => {
    const data = d.data() as Omit<CandidateDoc, "id">;
    list.push({ id: d.id, ...data } as CandidateDoc);
  });

  const candidateRoleFits = list.map((c) => getCandidateRoleFitOneLiner(c));
  const roleFitResults = await geminiBatchMatch(jdRoleFitOneLiner, candidateRoleFits);
  list = list.filter((_, i) => {
    const label = roleFitResults[i];
    return label === "MATCH" || label === "ADJACENT";
  });

  list = list.filter((c) => (c.score ?? 0) >= 50);
  list = list.filter((c) =>
    workAuthMatch(jobAuth, jobLocationTypes, (c.matchData as Record<string, unknown>)?.authRegions as string[] | undefined)
  );

  list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = list.slice(0, 10);

  const top10 = top.map((c) => ({
    id: c.id,
    score: c.score,
    yoe: c.yoe,
    profile: c.profile,
    role_fit: c.profile?.role_fit,
    candidateName: c.candidateName,
    email: c.email,
    phone: c.phone ?? null,
    matchData: c.matchData,
    resume_url: (c.resumeUrl ?? c.resume_url) as string | undefined,
  }));

  try {
    await db.collection("jds").doc(jdId).update({
      matchResult: {
        top10,
        completedAt: FieldValue.serverTimestamp(),
      },
    });
  } catch (writeErr) {
    console.error("Match result cache write failed:", writeErr);
  }

  return { success: true, top10 };
}

/** GET /api/jd/match?jobId=ABC123 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    }
    const result = await runMatch(jobId);
    if (!result.success && result.error) {
      const status = result.error === "Job not found" ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }
    return NextResponse.json({ success: true, top10: result.top10 ?? [] });
  } catch (err) {
    console.error("Match API GET error:", err);
    return NextResponse.json(
      { success: false, error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/jd/match — body: { jobId } or { jd } for backward compat; when jobId provided uses PST matching */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const jdId = body.jobId ?? body.jdId;
    const jdBody = body.jd;

    if (jdId) {
      const result = await runMatch(String(jdId));
      if (!result.success && result.error) {
        const status = result.error === "Job not found" ? 404 : 400;
        return NextResponse.json({ success: false, error: result.error }, { status });
      }
      return NextResponse.json({ success: true, top10: result.top10 ?? [] });
    }

    if (!jdBody) {
      return NextResponse.json({ error: "jdId or jd required" }, { status: 400 });
    }

    const db = getAdminDb();
    const jd = jdBody as Record<string, unknown>;
    const jdRoleFitOneLiner = getJDRoleFitOneLiner(jd);
    const jobLocationTypes = toArray(jd.location_type).map(String).map(normalizeLocation).filter(Boolean);
    const jobAuth = (jd.work_auth_requirement as Record<string, boolean> | undefined) ?? {};

    const candidatesSnap = await db.collection("candidates").get();
    let list: CandidateDoc[] = [];
    candidatesSnap.docs.forEach((d) => {
      const data = d.data() as Omit<CandidateDoc, "id">;
      list.push({ id: d.id, ...data } as CandidateDoc);
    });

    const candidateRoleFits = list.map((c) => getCandidateRoleFitOneLiner(c));
    const roleFitResults = await geminiBatchMatch(jdRoleFitOneLiner, candidateRoleFits);
    list = list.filter((_, i) => {
      const label = roleFitResults[i];
      return label === "MATCH" || label === "ADJACENT";
    });
    list = list.filter((c) => (c.score ?? 0) >= 50);
    list = list.filter((c) =>
      workAuthMatch(jobAuth, jobLocationTypes, (c.matchData as Record<string, unknown>)?.authRegions as string[] | undefined)
    );

    list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = list.slice(0, 10);
    const top10 = top.map((c) => ({
      id: c.id,
      score: c.score,
      yoe: c.yoe,
      profile: c.profile,
      role_fit: c.profile?.role_fit,
      candidateName: c.candidateName,
      email: c.email,
      phone: c.phone ?? null,
      matchData: c.matchData,
      resume_url: (c.resumeUrl ?? c.resume_url) as string | undefined,
    }));

    return NextResponse.json({ success: true, top10 });
  } catch (err) {
    console.error("Match API POST error:", err);
    return NextResponse.json(
      { error: "Server error", detail: String(err) },
      { status: 500 }
    );
  }
}
