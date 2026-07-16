import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanAndParseJSON } from "@/lib/eti/rubric-compress";
import { log, type LogContext } from "@/lib/server-logger";

/**
 * JD parse core (ADR-010 — shared, was inline in app/api/jd/parse/route.ts).
 * Turns free JD text into the structured fields + role anchors (primary/secondary/
 * tertiary) the JD pipeline needs. Both /api/jd/parse (recruiter pastes a JD) and
 * the Slack agent's intake-link tool (recruiter describes a role in chat) call THIS,
 * so a bot-minted JD has the same shape a web-minted one does and /api/jd/match works.
 */

// JD parsing only pulls a handful of fields the user reviews next, so Flash-Lite is
// plenty. 2.5 Flash-Lite is slated for deprecation ~Sep/Oct 2026; fall back to the
// next-gen Lite model rather than failing. Swap as the lineup moves on.
const JD_MODEL_PRIMARY = "gemini-2.5-flash-lite";
const JD_MODEL_FALLBACK = "gemini-3.1-flash-lite";

const JD_PARSE_SCHEMA = `
Output ONLY a valid JSON object with exactly these fields (no markdown, no commentary):
{
  "title": "string — job title",
  "seniority": "string — e.g. Junior, Mid, Senior, Lead",
  "role_category": "string — e.g. Backend, Frontend, Fullstack, DevOps",
  "tech_stack": ["string"] — array of technologies/tools mentioned,
  "primary": ["string"] — single core language/stack (e.g., Python, Node, Java, C#, Go)(e.g. main language, primary framework, primary DB). 2-3 core items only.",
  "secondary": ["string"] —  key supporting frameworks/tools (array). 3–8 items.",
  "tertiary": ["string"] — optional supporting tools . 2–5 items.",
  "location_type": "string — e.g. Remote, Onsite, Hybrid",
  "yoe_required": "string — years of experience required",
  "employment_type": "string — e.g. Full-time, Contract, Intern",
  "ml_mode": "one of builds_models | integrates_models | both | n/a — what the ROLE requires. builds_models = must train/fine-tune/architect models (PyTorch, TensorFlow, training, VAEs/GANs, classical ML). integrates_models = build LLM apps / integrate hosted model APIs WITHOUT training (OpenAI/Anthropic/Gemini, LangChain, RAG, prompting, agents). both = requires both. n/a = not an AI/ML role. Judge from the JD's actual requirements, not buzzwords.",
  "in_scope": "boolean — true if this is a software, data, ML/AI, or QA engineering role (backend, frontend, fullstack, mobile, data engineering, data science, ML/AI engineering, DevOps/SRE, QA/test automation, security engineering, etc. — anything evaluated on code or a GitHub/portfolio). false for any role outside that, e.g. mechanical, electrical, civil, chemical, biomedical, or other hardware engineering; sales, marketing, finance, legal, HR, operations, or design-only roles. Judge from the actual requirements, not the title alone."
}
Classify technologies from the JD into primary (core),secondary (important), and tertiary (supporting). Each array must contain only non-empty strings.
`;

export type MlMode = "builds_models" | "integrates_models" | "both" | "n/a";

const ML_MODES = new Set<string>(["builds_models", "integrates_models", "both", "n/a"]);

/** Coerce an untrusted value into a MlMode, defaulting to "n/a". Shared read-side
 *  guard used wherever a model- or client-supplied ml_mode is trusted. */
export function coerceMlMode(x: unknown): MlMode {
  return typeof x === "string" && ML_MODES.has(x) ? (x as MlMode) : "n/a";
}

export type ParsedJD = {
  title: string;
  seniority: string;
  role_category: string;
  tech_stack: string[];
  primary: string[];
  secondary: string[];
  tertiary: string[];
  location_type: string;
  yoe_required: string;
  employment_type: string;
  ml_mode: MlMode;
  /** false only when the model explicitly classifies the role as outside
   *  software/data/ML/QA (see JD_PARSE_SCHEMA). Defaults true on a missing/invalid
   *  value — a scope MISS never blocks a legitimate role. */
  in_scope: boolean;
};

/** The single line shown (web + Slack) when a JD is rejected as out of scope. */
export const UNSUPPORTED_ROLE_MESSAGE = "EigenWork works only for software, data, ML & QA roles.";

function toStrArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((x) => String(x).trim()).filter(Boolean);
}

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

async function runParseModel(text: string, modelName: string): Promise<ParsedJD> {
  const model = getGenAI().getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  const result = await model.generateContent(`${JD_PARSE_SCHEMA}\n\nJOB DESCRIPTION:\n${text}`);
  const raw = result.response.text();
  if (!raw) throw new Error("Empty response from Gemini");
  const parsed = cleanAndParseJSON(raw) as Record<string, unknown>;
  return {
    title: String(parsed.title ?? ""),
    seniority: String(parsed.seniority ?? ""),
    role_category: String(parsed.role_category ?? ""),
    tech_stack: toStrArray(parsed.tech_stack),
    primary: toStrArray(parsed.primary),
    secondary: toStrArray(parsed.secondary),
    tertiary: toStrArray(parsed.tertiary),
    location_type: String(parsed.location_type ?? ""),
    yoe_required: String(parsed.yoe_required ?? ""),
    employment_type: String(parsed.employment_type ?? ""),
    ml_mode: coerceMlMode(parsed.ml_mode),
    in_scope: typeof parsed.in_scope === "boolean" ? parsed.in_scope : true,
  };
}

/** Parse JD text into structured fields + anchors. Retries once on the fallback
 *  model (logged, not silent) before surfacing the error to the caller. */
export async function parseJdText(text: string, ctx: LogContext = {}): Promise<ParsedJD> {
  try {
    return await runParseModel(text, JD_MODEL_PRIMARY);
  } catch (err) {
    log("warn", "jd.parse_fallback", { ...ctx, primary: JD_MODEL_PRIMARY, fallback: JD_MODEL_FALLBACK }, err);
    return await runParseModel(text, JD_MODEL_FALLBACK);
  }
}
