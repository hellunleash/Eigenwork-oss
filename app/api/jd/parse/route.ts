import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanAndParseJSON } from "@/lib/eti/rubric-compress";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

async function parseJDWithLLM(text: string): Promise<{
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
}> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
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

export async function POST(req: Request) {
  try {
    const { jd} = await req.json();

    if (!jd) {
      return NextResponse.json(
        { error: "JD text is required" },
        { status: 400 }
      );
    }

    const parsed = await parseJDWithLLM(jd);
    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
