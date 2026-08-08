/**
 * Screen context assembly (Phase 2) — PURE (no Firestore/LLM), so it's unit-tested
 * by scripts/qa-interview-foundation.ts. Turns the persisted candidate + JD doc data
 * into the ScreenGenContext the generator needs, applying the load-bearing yoe>2 rule.
 */
import { defaultInterviewPlan, type InterviewPlan } from "@/lib/interview/plan";
import type { ScreenGenContext } from "@/lib/interview/screen";
import type { TakeHomeSetupContext } from "@/lib/interview/takehome";
import type { SystemDesignSetupContext } from "@/lib/interview/systemdesign";
import { cardFrom } from "@/lib/interview/prompt-util";

type Doc = Record<string, unknown> | null | undefined;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** yoe > 2 ⇒ senior track (no GitHub collected). Falls back to the JD seniority
 *  string only when the candidate has no parsed yoe. */
export function isSeniorTrack(candidate: Doc, jd: Doc): boolean {
  const yoe = num(candidate?.yoe);
  if (yoe != null) return yoe > 2;
  return /senior|staff|lead|principal/.test(str(jd?.seniority).toLowerCase());
}

/** Stored interviewPlan (partial) merged over the seniority defaults. */
export function resolveInterviewPlan(jd: Doc, senior: boolean): InterviewPlan {
  const base = defaultInterviewPlan(senior);
  const raw = jd?.interviewPlan;
  return raw && typeof raw === "object" ? { ...base, ...(raw as Partial<InterviewPlan>) } : base;
}

function skillsFrom(roleFit: unknown): string[] {
  if (!roleFit || typeof roleFit !== "object") return [];
  const rf = roleFit as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["primary", "secondary"]) {
    const arr = rf[key];
    if (Array.isArray(arr)) for (const x of arr) if (typeof x === "string") out.push(x);
  }
  return out.slice(0, 12);
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * PURE. Compose the JD's role requirements into a compact block so generation is
 * calibrated to the role (seniority, YoE, category, stack, must/nice/bonus skills),
 * not generic. Empty when the JD carries none.
 */
export function roleRequirementsFrom(jd: Doc): string {
  if (!jd || typeof jd !== "object") return "";
  const j = jd as Record<string, unknown>;
  const lines: string[] = [];
  const sen = str(j.seniority);
  if (sen) lines.push(`seniority: ${sen}`);
  const yoe = j.yoe_required;
  if (yoe != null && String(yoe).trim() !== "") lines.push(`years of experience required: ${String(yoe)}`);
  const cat = str(j.role_category);
  if (cat) lines.push(`role category: ${cat}`);
  const stack = strList(j.tech_stack);
  if (stack.length) lines.push(`tech stack: ${stack.join(", ")}`);
  const rf = j.role_fit;
  if (rf && typeof rf === "object") {
    const r = rf as Record<string, unknown>;
    if (typeof r.one_liner === "string" && r.one_liner) lines.push(`role summary: ${r.one_liner}`);
    const must = strList(r.primary);
    const nice = strList(r.secondary);
    const bonus = strList(r.tertiary);
    if (must.length) lines.push(`must-have skills: ${must.join(", ")}`);
    if (nice.length) lines.push(`nice-to-have skills: ${nice.join(", ")}`);
    if (bonus.length) lines.push(`bonus skills: ${bonus.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * PURE. Compose the ETI engine's OWN reasoning (block justifications + the overlord
 * risk/authenticity verdict) that the result card was distilled FROM. This is a richer
 * grounding signal for probe generation than the three-line card alone — it gives the
 * generator the substance behind the flag. Internal acronym labels (ESQ/OM/…) are
 * stripped; only the free-text reasoning is passed. Engine-generated (not raw candidate
 * text), but still fenced. Empty for pre-Phase-2 / v1 candidates that carry neither.
 */
export function etiReasoningFrom(candidate: Doc): string {
  if (!candidate || typeof candidate !== "object") return "";
  const c = candidate as Record<string, unknown>;

  const notes: string[] = [];
  const bd = c.breakdown;
  if (bd && typeof bd === "object") {
    for (const block of Object.values(bd as Record<string, unknown>)) {
      if (block && typeof block === "object") {
        const j = (block as Record<string, unknown>).justification;
        if (typeof j === "string" && j.trim()) notes.push(`- ${j.trim().slice(0, 800)}`);
      }
    }
  }
  const assessment = notes.length ? `ASSESSMENT NOTES (the engine's reasoning behind the card):\n${notes.join("\n")}` : "";

  const ov = c.overlord_verdict;
  const ovLines: string[] = [];
  if (ov && typeof ov === "object") {
    const o = ov as Record<string, unknown>;
    if (typeof o.verdict === "string" && o.verdict) ovLines.push(`verdict: ${o.verdict}`);
    if (o.fraud_risk != null && String(o.fraud_risk).trim() !== "") ovLines.push(`risk level: ${String(o.fraud_risk)}`);
    const trig = Array.isArray(o.triggered)
      ? o.triggered.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter((s) => s && s !== "{}").slice(0, 8)
      : [];
    if (trig.length) ovLines.push(`risk flags: ${trig.join("; ")}`);
  }
  const risk = ovLines.length ? `RISK / AUTHENTICITY ASSESSMENT:\n${ovLines.join("\n")}` : "";

  return [assessment, risk].filter(Boolean).join("\n\n");
}

/**
 * PURE. Build the screen-generation context. Seniority-branched grounding: senior →
 * `work_history` only; junior → `github_metrics` only (never both), so the senior
 * prompt structurally cannot carry a GitHub grounding block.
 */
export function buildScreenGenContext(candidate: Doc, jd: Doc, plan: InterviewPlan): ScreenGenContext {
  const senior = isSeniorTrack(candidate, jd);
  return {
    candidateName: str(candidate?.candidateName) || "Candidate",
    roleTitle: str(jd?.title) || "this role",
    senior,
    screen: plan.screen,
    card: cardFrom(candidate?.card),
    // work_history grounds BOTH tracks (a junior still has claimed work to probe);
    // github_metrics is junior-only (senior yoe>2 collects no GitHub).
    workHistory: candidate?.work_history ?? [],
    ...(senior ? {} : { githubMetrics: candidate?.github_metrics ?? {} }),
    roleSkills: skillsFrom(jd?.role_fit),
    roleRequirements: roleRequirementsFrom(jd),
    etiReasoning: etiReasoningFrom(candidate),
  };
}

/**
 * PURE. Build the take-home setup context (stage 4). Seniority-agnostic grounding —
 * the candidate submits a fresh repo for the assignment, so the code signal comes from
 * that repo at submit time, not from a portfolio. The recruiter's authored assignment
 * (plan.takeHome.prompt) flows through; when absent the generator writes one.
 */
export function buildTakeHomeSetupContext(candidate: Doc, jd: Doc, plan: InterviewPlan): TakeHomeSetupContext {
  const senior = isSeniorTrack(candidate, jd);
  const th = plan.takeHome;
  return {
    roleTitle: str(jd?.title) || "this role",
    senior,
    card: cardFrom(candidate?.card),
    recruiterPrompt: typeof th.prompt === "string" ? th.prompt : null,
    whatGoodLooksLike: typeof th.whatGoodLooksLike === "string" ? th.whatGoodLooksLike : null,
    timeboxHours: typeof th.timeboxHours === "number" ? th.timeboxHours : null,
    roleSkills: skillsFrom(jd?.role_fit),
    roleRequirements: roleRequirementsFrom(jd),
  };
}

/**
 * PURE. Build the system-design setup context (stage 4, senior signal). Senior
 * scenarios are grounded in the candidate's own `work_history` domain (no GitHub for
 * yoe>2); the recruiter's authored scenario (plan.systemDesign.prompt) wins.
 */
export function buildSystemDesignSetupContext(candidate: Doc, jd: Doc, plan: InterviewPlan): SystemDesignSetupContext {
  const senior = isSeniorTrack(candidate, jd);
  const sd = plan.systemDesign;
  return {
    roleTitle: str(jd?.title) || "this role",
    senior,
    card: cardFrom(candidate?.card),
    recruiterPrompt: typeof sd.prompt === "string" ? sd.prompt : null,
    rubricEmphasis: typeof sd.rubricEmphasis === "string" ? sd.rubricEmphasis : null,
    ...(senior ? { workHistory: candidate?.work_history ?? [] } : {}),
    roleSkills: skillsFrom(jd?.role_fit),
    roleRequirements: roleRequirementsFrom(jd),
  };
}
