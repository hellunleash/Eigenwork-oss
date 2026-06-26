import { getAdminDb, freshResumeUrl, adminStorageDownload } from "@/lib/firebase-admin";
import { deriveRoleStatus, type RoleStatus } from "@/lib/jd-status";
import { type CandidateExportRow } from "@/lib/candidate-export";

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
  /** A fresh 1-hour signed URL to the candidate's resume PDF (regenerated on read,
   *  like the dashboard download button), or null if no resume on file. */
  resumeUrl: string | null;
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
 * Submitted-candidate count for one role — the single definition of appliedCount
 * (matchData.jobId == job AND status == "submitted"), the same one the dashboard,
 * /api/jd/list and the submission-cap gate use. Centralized so every caller
 * (listRolesWithStatus, the ready/full ping) shares ONE query, never its own copy.
 * Degrades to 0 if the aggregate is unavailable.
 */
export async function countSubmitted(jobId: string): Promise<number> {
  try {
    const snap = await getAdminDb()
      .collection("candidates")
      .where("matchData.jobId", "==", jobId)
      .where("status", "==", "submitted")
      .count()
      .get();
    return snap.data().count;
  } catch {
    return 0;
  }
}

/**
 * Roles + live fill status, for the bot's roles answers. appliedCount comes from
 * the shared `countSubmitted`; status from the shared `deriveRoleStatus`, so
 * "Filling/Ready/Closed" can't drift between Slack and the dashboard. Counts per
 * role, so it's called only when a roles question fires — never on the router path.
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
      const appliedCount = await countSubmitted(d.id);
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
  const resumePath = typeof d.resumePath === "string" ? d.resumePath : null;
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
    resumeUrl: await freshResumeUrl(resumePath),
  };
}

/**
 * The role's ranked candidates as flat export rows, drawn from the persisted
 * shortlist (jds.matchResult.top20 — same data the dashboard's CSV export uses).
 * Org-scoped: returns null if the JD isn't this org's (T3). No contact PII (email /
 * resume) by design — the bulk export is screening data only.
 */
export async function getRoleCandidatesForExport(
  orgId: string,
  jobId: string
): Promise<{ role: string; rows: CandidateExportRow[] } | null> {
  const db = getAdminDb();
  const snap = await db.collection("jds").doc(jobId).get();
  const jd = snap.data();
  if (!jd || jd.orgId !== orgId) return null;
  const mr = jd.matchResult as { top20?: unknown[] } | undefined;
  const top = Array.isArray(mr?.top20) ? mr!.top20 : [];
  const rows = top.map((c, i) => mapExportRow(c, i));
  return { role: typeof jd.title === "string" ? jd.title : "", rows };
}

/**
 * The candidate's resume PDF bytes + a download filename, org-scoped (T3: the
 * candidate's JD must belong to orgId). Returns null when there's no resume on file
 * or the download fails — the caller falls back to a link. Used to ATTACH the PDF
 * in Slack (vs. just linking it).
 */
export async function getCandidateResume(
  orgId: string,
  candidateId: string
): Promise<{ filename: string; bytes: Buffer } | null> {
  const db = getAdminDb();
  const snap = await db.collection("candidates").doc(candidateId).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  const jobId = (d.matchData as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== "string") return null;
  const jdSnap = await db.collection("jds").doc(jobId).get();
  if (!jdSnap.exists || (jdSnap.data()?.orgId as string | undefined) !== orgId) return null;
  const resumePath = typeof d.resumePath === "string" ? d.resumePath : null;
  if (!resumePath) return null;
  try {
    const bytes = await adminStorageDownload(resumePath);
    const name = typeof d.candidateName === "string" && d.candidateName ? d.candidateName : "candidate";
    const filename = `${name.replace(/[^\w.-]+/g, "_")}-resume.pdf`;
    return { filename, bytes };
  } catch {
    return null;
  }
}

function mapExportRow(c: unknown, i: number): CandidateExportRow {
  const e = c as {
    candidateName?: string;
    score?: number;
    shortlistRank?: number;
    matchData?: { locations?: unknown; work_auth?: unknown };
    card?: { title?: string; edge?: string; flag?: string };
    role_fit?: unknown;
    profile?: { role_fit?: unknown };
  };
  const loc = e.matchData?.locations;
  const location = Array.isArray(loc) ? loc.join("; ") : loc != null ? String(loc) : "";
  const workAuth = typeof e.matchData?.work_auth === "string" ? e.matchData.work_auth.trim() : "";
  const rf = e.role_fit ?? e.profile?.role_fit;
  const roleFit =
    typeof rf === "string"
      ? rf
      : rf != null && typeof rf === "object" && "one_liner" in rf
        ? String((rf as Record<string, unknown>).one_liner ?? "")
        : "";
  return {
    rank: typeof e.shortlistRank === "number" ? e.shortlistRank : i + 1,
    name: e.candidateName ?? "",
    score: typeof e.score === "number" ? e.score : null,
    location,
    workAuth,
    title: e.card?.title ?? "",
    edge: e.card?.edge ?? "",
    flag: e.card?.flag ?? "",
    roleFit,
  };
}
