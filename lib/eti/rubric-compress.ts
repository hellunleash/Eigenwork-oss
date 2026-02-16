import { COMMON_INSTRUCTIONS } from "./rubric-common";
import { BLOCK_1_ET_ESQ, BLOCK_2_3_ET_BEHAVIORAL } from "./rubric-junior";
import { ALL_BLOCKS_EXP } from "./rubric-senior";
import { OVERLORD_RULES } from "./rubric-overlord";
import { EXECUTION_CONTEXT } from "./rubric-context";

// ⚡ UPDATED SCHEMAS: added structured role_fit with one_liner
const schemaMap = {
  "junior-esq": `
  {
    "A1": number, "A2": number, "A3": number, "A4": number,
    "ESQ": number,
    "justification": short phrase(25words max)
  }
  `,
  "junior-behavioral": `
  {
    "pdq_breakdown": { "B1": number, "B2": number, "B3": number, "PDQ": number, "justification": "short phrase(5-15words)" },
    "nr_breakdown": { "C1": number, "C2": number, "NR": number, "justification": "short phrase(5-15words)" },
    "operating_profile": {
        "ramp_expectation": "High | Medium | Low",
        "ramp_reason": "short phrase(5-15words)",
        "supervision_load": "High | Medium | Low",
        "supervision_reason": "short phrase(5-15words)",
        "stack_transfer_risk": "High | Medium | Low",
        "reliability_under_pressure": "High | Medium | Low",

        "role_fit": {
          "title": string,
          "primary": string,
          "secondary": string[],
          "tertiary": string[],
          "one_liner": string
        },

        "risk_flags": string[]
    },
    "overlord": "safe" | "suspicious_cap_46" | "inflated_cap_40",
    "yoe": number
  }
  `,
  "senior": `
  {
    "om_breakdown": { "A1": number, "A2": number, "A3": number, "OM": number, "justification": "short phrase(5-15words)" },
    "od_breakdown": { "B1": number, "B2": number, "B3": number, "OD": number, "justification": "short phrase(5-15words)" },
    "pc_breakdown": { "C1": number, "C2": number, "C3": number, "PC": number, "justification": "short phrase(5-15words)" },
    "operating_profile": {
        "ramp_expectation": "High | Medium | Low",
        "ramp_reason": "short phrase(5-15words)",
        "supervision_load": "High | Medium | Low",
        "supervision_reason": "short phrase(5-15words)",
        "stack_transfer_risk": "High | Medium | Low",
        "reliability_under_pressure": "High | Medium | Low",

        "role_fit": {
          "title": string,
          "primary": string,
          "secondary": string[],
          "tertiary": string[],
          "one_liner": string
        },

        "risk_flags": string[]
    },
    "overlord": "safe" | "suspicious_cap_46" | "inflated_cap_40",
    "yoe": number
  }
  `
};

const YOE_INSTRUCTIONS = `
Years of Experience (yoe) calculation:
- Current server date is provided above. Treat "Present", "Current", "Now", or similar as that exact date.
- Extract work history dates from the resume. Use ONLY explicitly stated start/end dates.
- DO NOT infer or guess missing dates. If start or end is missing for a role, exclude that role from the calculation.
- Calculate total experience in MONTHS first. Merge overlapping roles (same period counted once).
- Convert months to years as a decimal (e.g., 42 months = 3.5 years). Round to one decimal place.
- Output yoe as a number in the JSON (e.g., 3.8). If no valid dates found, output 0.
`;

export function buildETIPrompt({
  context,
  mode,
  currentDate
}: {
  context: string;
  mode: "junior-esq" | "junior-behavioral" | "senior";
  currentDate?: string;
}) {

  const header = `You are EigenTrustIndex(ETI), a professional-grade technical candidate evaluator for fast-moving startups (pre-seed to Series D).
You prefer risk management over optimistic scoring. You MUST output ONLY a valid JSON object.
NO markdown, NO headings, NO commentary.
Justifications must be concise(5-15words) and NEVER break JSON strings or structure.

For role_fit:
- Extract the correct title, primary, secondary, and tertiary skills.
- Create a one_liner in EXACT format:
  "<title> (<primary> | <secondary items comma-separated> | <tertiary items comma-separated>)"
- Do NOT include the words primary, secondary, or tertiary in the one_liner.
`;

  let rubricText = "";
  let taskText = "";

  if (mode === "junior-esq") {
    rubricText = `${COMMON_INSTRUCTIONS}\n${BLOCK_1_ET_ESQ}`;
    taskText = "TASK: Score ESQ Block only. Input is GitHub DNA.";
  }
  else if (mode === "junior-behavioral") {
    rubricText = `${COMMON_INSTRUCTIONS}\n${BLOCK_2_3_ET_BEHAVIORAL}\n${EXECUTION_CONTEXT}\n${OVERLORD_RULES}`;
    taskText = "TASK: First score PDQ and NR and generate the operating_profile and then execute overlord rules.";
  }
  else if (mode === "senior") {
    rubricText = `${COMMON_INSTRUCTIONS}\n${ALL_BLOCKS_EXP}\n${EXECUTION_CONTEXT}\n${OVERLORD_RULES}`;
    taskText = "TASK: First score OM, OD, and PC and generate the operating_profile and then execute overlord rules.";
  }

  return `
${header}

=== RUBRICS ===
${rubricText}

=== INSTRUCTIONS ===
${taskText}

=== INPUT CONTEXT ===
${currentDate ? `Current server date: ${currentDate}\n\n` : ""}${context}

${currentDate && (mode === "junior-behavioral" || mode === "senior") ? `=== YOE CALCULATION ===\n${YOE_INSTRUCTIONS}\n` : ""}
=== REQUIRED OUTPUT SCHEMA ===
${schemaMap[mode]}
`;
}

// Helper: Clean JSON
export function cleanAndParseJSON(text: string) {
  try {
    // Remove code fences
    text = text.replace(/```json|```/g, "").trim();

    // Extract FIRST '{' and LAST '}'
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1) {
      console.error("❌ No braces found in:", text);
      return {};
    }

    const jsonString = text.substring(start, end + 1);

    return JSON.parse(jsonString);
  } catch (err) {
    console.error("❌ JSON Parse Error. Raw text:", text);
    return {};
  }
}

// Helper: Truncate
export function truncateInput(text: string, maxLength: number) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n...[TRUNCATED]";
}