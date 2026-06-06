import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanAndParseJSON } from "@/lib/eti/rubric-compress";
import { requireFirebaseUser } from "@/lib/auth-server";
import { allowRequest } from "@/lib/rate-limit";
import { getRequestId, log, timeMs, type LogContext } from "@/lib/server-logger";

// JD length cap. Realistic job descriptions are 1-10k chars; very long ones
// (with full company description + benefits + mission) reach ~15k. 50k is
// roughly 12,500 words / 25 pages of plain text — 5-10x the longest
// legitimate JD anyone writes. The cap is purely an abuse / accidental-dump
// guard; no real founder should ever hit it.
const MAX_JD_CHARS = 50_000;

// Per-authenticated-user rate limit. Generous: a founder typically parses
// a JD 1-3 times during the create flow. 30/min still leaves room for
// experimentation while keeping a single account from draining Gemini
// quota for everyone else.
const PER_USER_PARSE_LIMIT = 30;
const PER_USER_PARSE_WINDOW_SECONDS = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// JD parsing only needs to pull a handful of fields out of pasted text that the
// user reviews & edits on the very next screen, so Flash-Lite is plenty — far
// cheaper than Flash and with little/no "thinking" overhead. 2.5 Flash-Lite is
// slated for deprecation around Sep/Oct 2026; once Google retires it the
// primary call will start erroring. Rather than fail the parse, fall back to
// the next-gen Lite model. Swap these strings as the model lineup moves on.
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
  "employment_type": "string — e.g. Full-time, Contract, Intern"
}
Classify technologies from the JD into primary (core),secondary (important), and tertiary (supporting). Each array must contain only non-empty strings.
`;

function toStrArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((x) => String(x).trim()).filter(Boolean);
}

type ParsedJD = {
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
};

async function runParseModel(text: string, modelName: string): Promise<ParsedJD> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const prompt = `${JD_PARSE_SCHEMA}\n\nJOB DESCRIPTION:\n${text}`;
  const result = await model.generateContent(prompt);
  const response = result.response;
  const raw = response.text();
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
  };
}

async function parseJDWithLLM(text: string, ctx: LogContext): Promise<ParsedJD> {
  try {
    return await runParseModel(text, JD_MODEL_PRIMARY);
  } catch (err) {
    // Primary failed (most likely once 2.5 Flash-Lite is deprecated, but also
    // any transient model error). Retry once on the fallback model rather than
    // failing the parse — logged as a warn so the switch isn't silent.
    log("warn", "jd.parse_fallback", { ...ctx, primary: JD_MODEL_PRIMARY, fallback: JD_MODEL_FALLBACK }, err);
    return await runParseModel(text, JD_MODEL_FALLBACK);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req.headers);
  const route = "/api/jd/parse";
  try {
    const auth = await requireFirebaseUser(req.headers);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Per-user rate limit on the Gemini call. Skipped on the negative path
    // (no userId) — that path can't reach the Gemini call anyway.
    const rl = await allowRequest({
      key: `jd_parse:${auth.userId}`,
      limit: PER_USER_PARSE_LIMIT,
      windowSeconds: PER_USER_PARSE_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      log("warn", "rate_limit.jd_parse_blocked", {
        requestId,
        route,
        userId: auth.userId,
        resetAtMs: rl.resetAtMs,
      });
      const retryAfterSec = Math.max(
        1,
        Math.ceil((rl.resetAtMs - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: "rate_limited",
          message:
            "Too many parse attempts in a short window. Try again shortly.",
          retryAfter: retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const { jd } = await req.json();

    if (!jd || typeof jd !== "string") {
      return NextResponse.json(
        { error: "JD text is required" },
        { status: 400 }
      );
    }

    // Length cap. See MAX_JD_CHARS rationale at top of file — this is an
    // abuse backstop, not a content-compression demand. Real JDs never
    // reach this size.
    if (jd.length > MAX_JD_CHARS) {
      log("warn", "jd.too_long", {
        requestId,
        route,
        userId: auth.userId,
        chars: jd.length,
      });
      return NextResponse.json(
        {
          error: "jd_too_long",
          message:
            "Job description is unusually long. Please trim to under 50,000 characters.",
        },
        { status: 413 }
      );
    }

    const t = timeMs();
    const parsed = await parseJDWithLLM(jd, { requestId, route, userId: auth.userId });
    log("info", "jd.parse_ok", { requestId, route, userId: auth.userId, latencyMs: t() });
    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    log("error", "jd.parse_failed", { requestId, route }, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
