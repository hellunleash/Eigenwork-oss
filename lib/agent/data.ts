import { getAdminDb } from "@/lib/firebase-admin";
import { deriveRoleStatus, type RoleStatus } from "@/lib/jd-status";

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
  email: string | null;
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

export type RoleWithStatus = {
  id: string;
  title: string;
  seniority: string;
  status: RoleStatus;
  appliedCount: number;
  submissionCap: number;
};

/**
 * Roles + live fill status, for the bot's roles answers. Mirrors the dashboard's
 * /api/jd/list derivation (appliedCount = candidates with status "submitted" on
 * this job) but reuses the shared `deriveRoleStatus`, so "Filling/Ready/Closed"
 * can't drift between Slack and the dashboard. Runs a count() per role, so it's
 * called only when a roles question fires — never on the per-message router path.
 */
export async function listRolesWithStatus(orgId: string): Promise<RoleWithStatus[]> {
  const db = getAdminDb();
  const snap = await db.collection("jds").where("orgId", "==", orgId).get();
  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const rawCap = typeof data.submissionCap === "number" ? data.submissionCap : parseInt(String(data.submissionCap), 10);
      const submissionCap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 10;
      const isClosed = Boolean(data.isClosed);
      const mr = data.matchResult as { top20?: unknown[] } | undefined;
      const hasMatchResult = Array.isArray(mr?.top20) && mr.top20.length > 0;
      let appliedCount = 0;
      try {
        const countSnap = await db
          .collection("candidates")
          .where("matchData.jobId", "==", d.id)
          .where("status", "==", "submitted")
          .count()
          .get();
        appliedCount = countSnap.data().count;
      } catch {
        appliedCount = 0; // count unavailable → treat as no applicants (status degrades gracefully)
      }
      return {
        id: d.id,
        title: typeof data.title === "string" ? data.title : "",
        seniority: typeof data.seniority === "string" ? data.seniority : "",
        status: deriveRoleStatus({ isClosed, hasMatchResult, submissionCap, appliedCount }),
        appliedCount,
        submissionCap,
      };
    })
  );
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
    email: typeof d.email === "string" && d.email.trim() ? d.email.trim() : null,
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
