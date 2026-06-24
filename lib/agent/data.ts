import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Org-scoped read layer for the agent (ADR-010 Phase 2). Everything here is
 * READ-ONLY over already-persisted data — the bot never re-reads a resume or
 * re-runs scoring. Ownership is enforced on every read (guardrail 2): a candidate
 * resolves only if its JD belongs to the caller's org.
 */
export type JobLite = { id: string; title: string; seniority: string };

export type CandidateLite = {
  id: string;
  name: string;
  jobId: string;
  jobTitle: string;
  score: number | null;
  rank: number | null;
};

export type CandidateDetail = {
  id: string;
  name: string;
  jobId: string;
  jobTitle: string;
  score: number | null;
  card: { title?: string; edge?: string; flag?: string } | null;
  breakdown: unknown;
  githubMetrics: unknown;
  workHistory: unknown;
  stage: string | null;
};

export async function listJobs(orgId: string): Promise<JobLite[]> {
  const db = getAdminDb();
  const snap = await db.collection("jds").where("orgId", "==", orgId).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === "string" ? data.title : "",
      seniority: typeof data.seniority === "string" ? data.seniority : "",
    };
  });
}

/**
 * The org's candidate roster, drawn from each role's persisted shortlist
 * (jds.matchResult.top20). This is the grounding set the router resolves names
 * against — the bot may only act on an id that appears here.
 */
export async function getOrgCandidateRoster(orgId: string): Promise<CandidateLite[]> {
  const jobs = await listJobs(orgId);
  const db = getAdminDb();
  const perJob = await Promise.all(
    jobs.map(async (job) => {
      const snap = await db.collection("jds").doc(job.id).get();
      const mr = snap.data()?.matchResult as { top20?: unknown[] } | undefined;
      const top = Array.isArray(mr?.top20) ? mr!.top20 : [];
      const out: CandidateLite[] = [];
      top.forEach((c, i) => {
        const cc = c as { id?: string; candidateName?: string; score?: number; shortlistRank?: number };
        if (typeof cc.id === "string") {
          out.push({
            id: cc.id,
            name: typeof cc.candidateName === "string" && cc.candidateName ? cc.candidateName : "Candidate",
            jobId: job.id,
            jobTitle: job.title,
            score: typeof cc.score === "number" ? cc.score : null,
            rank: typeof cc.shortlistRank === "number" ? cc.shortlistRank : i + 1,
          });
        }
      });
      return out;
    })
  );
  return perJob.flat();
}

export async function getCandidateDetail(orgId: string, candidateId: string): Promise<CandidateDetail | null> {
  const db = getAdminDb();
  const snap = await db.collection("candidates").doc(candidateId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;

  const jobId = (d.matchData as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== "string") return null;
  const jdSnap = await db.collection("jds").doc(jobId).get();
  if (!jdSnap.exists || (jdSnap.data()?.orgId as string | undefined) !== orgId) return null;

  const card = d.card as { title?: string; edge?: string; flag?: string } | undefined;
  return {
    id: candidateId,
    name: typeof d.candidateName === "string" && d.candidateName ? d.candidateName : "Candidate",
    jobId,
    jobTitle: typeof jdSnap.data()?.title === "string" ? (jdSnap.data()!.title as string) : "",
    score: typeof d.score === "number" ? d.score : null,
    card: card ?? null,
    breakdown: d.breakdown ?? null,
    githubMetrics: d.github_metrics ?? null,
    workHistory: d.work_history ?? null,
    stage: typeof d.stage === "string" ? d.stage : null,
  };
}
