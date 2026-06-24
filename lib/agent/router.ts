import { geminiJson } from "@/lib/agent/gemini";
import type { CandidateLite, JobLite } from "@/lib/agent/data";

/**
 * Intent router (ADR-010 Phase 2). A single JSON-mode Gemini call classifies the
 * recruiter's free-text message and RESOLVES any candidate/role references to real
 * ids from the supplied roster — never inventing one (guardrail 4). Ambiguous or
 * unmatched references route to "clarify" so the bot asks instead of guessing.
 */
export type Intent =
  | "find"
  | "compare"
  | "explain"
  | "describe"
  | "create_intake"
  | "move_stage"
  | "draft_outreach"
  | "help"
  | "clarify";

export type IntakeFields = {
  title?: string;
  seniority?: string;
  location_type?: string;
  employment_type?: string;
  yoe_required?: string;
};

export type RouterResult = {
  intent: Intent;
  candidateIds?: string[];
  jobId?: string;
  roleQuery?: string;
  topic?: string;
  clarifyQuestion?: string;
  intake?: IntakeFields;
  /** move_stage: the target pipeline stage + optional interview outcome. */
  targetStage?: string;
  outcome?: string;
};

export async function routeMessage(text: string, jobs: JobLite[], roster: CandidateLite[]): Promise<RouterResult> {
  const jobsList =
    jobs.map((j) => `- ${j.id} :: ${j.title || "untitled"}${j.seniority ? ` (${j.seniority})` : ""}`).join("\n") || "(none)";
  const rosterList =
    roster
      .map((c) => `- ${c.id} :: ${c.name} — rank ${c.rank ?? "?"}, score ${c.score ?? "?"} — job ${c.jobId}`)
      .join("\n") || "(none)";

  const prompt = `You are the intent router for EigenBot, a recruiting assistant in Slack. Classify the recruiter's message into ONE intent and resolve any candidate/role references to the IDs provided. Output ONLY JSON.

Intents:
- "describe": tell me about ONE candidate. Set candidateIds (exactly one).
- "compare": compare TWO OR MORE candidates ("who is better and why"). Set candidateIds (two or more).
- "explain": explain a specific aspect of ONE candidate (a flag, a signal, the score). Set candidateIds (one) and topic.
- "find": find / list / rank candidates for a role or a query. Set jobId if a named role matches the jobs list, otherwise set roleQuery.
- "create_intake": the recruiter wants an application/intake link for a NEW role. Extract intake:{title, seniority, location_type, employment_type, yoe_required} from the text (any subset you can infer; omit unknown fields).
- "move_stage": the recruiter wants to move/advance/reject candidate(s) in the pipeline. Set candidateIds (one or more) and targetStage (exactly one of: interviewing, offer, hired, rejected, withdrawn). Map natural language: "move to interview" / "shortlist for interview" → interviewing; "extend an offer" / "send offer" → offer; "mark hired" / "hire them" → hired; "reject" / "pass on" / "interview failed" → rejected; "they withdrew" / "offer declined" → withdrawn. For "interview failed" also set outcome:"failed".
- "draft_outreach": the recruiter wants a personalized outreach email drafted to candidate(s). Set candidateIds (one or more).
- "help": greeting, a capabilities question, or unclear small talk.
- "clarify": the message refers to a candidate or role you CANNOT uniquely resolve (e.g. two people share the named first name, or no roster name matches). Set clarifyQuestion with a short question; you may also set candidateIds to the ambiguous options.

RULES:
- NEVER invent a candidateId. Use only IDs from the roster. If a named person is not in the roster, choose "clarify".
- If more than one roster entry could match a name, choose "clarify" and name the options in clarifyQuestion.

Jobs (id :: title):
${jobsList}

Candidates (id :: name — rank, score — job):
${rosterList}

Recruiter message:
"""${text}"""

Return JSON with only the fields relevant to the chosen intent, e.g.
{"intent":"compare","candidateIds":["abc","def"]} or
{"intent":"move_stage","candidateIds":["abc"],"targetStage":"interviewing"}`;

  const result = await geminiJson<RouterResult>(prompt, { temperature: 0 });
  if (!result || !result.intent) return { intent: "help" };

  // Guardrail 4: drop any id the model produced that isn't a real roster entry.
  if (Array.isArray(result.candidateIds)) {
    const valid = new Set(roster.map((c) => c.id));
    result.candidateIds = result.candidateIds.filter((id) => typeof id === "string" && valid.has(id));
  }
  return result;
}
