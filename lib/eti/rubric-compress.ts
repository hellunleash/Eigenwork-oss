import { COMMON_INSTRUCTIONS, COMMON_INSTRUCTIONS_V2 } from "./rubric-common";
import { BLOCK_1_ET_ESQ, BLOCK_1_ET_ESQ_V2, BLOCK_2_3_ET_BEHAVIORAL, BLOCK_2_3_ET_BEHAVIORAL_V2 } from "./rubric-junior";
import { ALL_BLOCKS_EXP, ALL_BLOCKS_EXP_V2 } from "./rubric-senior";
import { OVERLORD_RULES, OVERLORD_RULES_V2 } from "./rubric-overlord";
import { EXECUTION_CONTEXT, EXECUTION_CONTEXT_V2 } from "./rubric-context";

// Output-schema fragments. Each scoring concern (ESQ / operating profile /
// overlord) owns its own fragment so rubric changes touch exactly one block;
// schemaMap below only composes them. Composition is byte-identical to the
// previous inline literals — the LLM sees the same prompt text.
export const ESQ_SCHEMA = `
  {
    "A1": number, "A2": number, "A3": number, "A4": number,
    "ESQ": number,
    "justification": short phrase(25words max)
  }
  `;

export const PROFILE_SCHEMA_FRAGMENT = `"operating_profile": {
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
    }`;

export const OVERLORD_SCHEMA_FRAGMENT = `"overlord": "safe" | "suspicious_cap_46" | "inflated_cap_40"`;

// Scoring-v2 overlord output schema. Replaces the bare-string overlord field
// with a structured object; the numeric cap is derived in code from fraud_risk
// (see applyOverlordCap in lib/evaluation-runner.ts), never emitted by the model.
// ADR-007: triggered[].reason is now recruiter-facing, and work_history is
// required on EVERY verdict (including "safe") — the Signals panel and the
// title brand chip both key off this list.
export const OVERLORD_SCHEMA_FRAGMENT_V2 = `"overlord": {
      "verdict": "safe" | "suspicious" | "inflated",
      "fraud_risk": number,
      "triggered": [ { "id": string, "reason": "recruiter-language phrase(<=12 words, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" } ],
      "work_history": [
        {
          "employer": string,
          "title": string,
          "start": "YYYY-MM",
          "end": "YYYY-MM" | "present",
          "scope_one_liner": "short phrase(<=15 words, what they actually shipped)",
          "brand_bucket": "FAANG" | "YC" | "tier-1" | null
        }
      ]
    }`;

// Scoring-v2 profile fragment. Keeps the SAME `operating_profile` wrapper so the
// runner's `json.operating_profile` parsing is unchanged, but DROPS the four
// operating dimensions (ramp/supervision/stack-transfer/reliability) — v2
// collapses them into a code-assembled decision line. role_fit is byte-identical
// to v1 (LOAD-BEARING: match route + rolefit-cache key off its one_liner) and
// risk_flags is preserved.
// ADR-007: three new recruiter-facing fields (title, edge, flag) emitted by the
// execution-context section. They go alongside role_fit (NOT inside it) so the
// existing role_fit parse path and the match-route's role_fit.one_liner key are
// completely untouched.
export const PROFILE_SCHEMA_FRAGMENT_V2 = `"operating_profile": {
        "role_fit": {
          "title": string,
          "primary": string,
          "secondary": string[],
          "tertiary": string[],
          "one_liner": string
        },

        "risk_flags": string[],

        "ml_mode": "builds_models | integrates_models | both | n/a",

        "title": "recruiter-facing headline(<=60 chars, follows the locked title pattern, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)",
        "edge": "one sharp sentence about the strongest evidence(<=25 words, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)",
        "flag": "null OR recruiter-language phrase about a REAL fraud-shaped risk(<=20 words, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block). null on clean candidates."
    }`;

// Schema builders take the profile/overlord fragments as parameters so the v2
// path can swap individual fragments (registered in V2_BLOCKS) without any
// workstream rewriting the whole schema literal.
function juniorBehavioralSchema(profileFrag: string, overlordFrag: string): string {
  return `
  {
    "pdq_breakdown": { "B1": number, "B2": number, "B3": number, "PDQ": number, "justification": "recruiter-language phrase(<=25 words, cite specific evidence, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" },
    "nr_breakdown": { "C1": number, "C2": number, "NR": number, "justification": "recruiter-language phrase(<=25 words, cite specific evidence, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" },
    ${profileFrag},
    ${overlordFrag},
    "yoe": number
  }
  `;
}

function seniorSchema(profileFrag: string, overlordFrag: string): string {
  return `
  {
    "om_breakdown": { "A1": number, "A2": number, "A3": number, "OM": number, "justification": "recruiter-language phrase(<=25 words, cite specific evidence, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" },
    "od_breakdown": { "B1": number, "B2": number, "B3": number, "OD": number, "justification": "recruiter-language phrase(<=25 words, cite specific evidence, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" },
    "pc_breakdown": { "C1": number, "C2": number, "C3": number, "PC": number, "justification": "recruiter-language phrase(<=25 words, cite specific evidence, NEVER use ESQ/PDQ/NR/OM/OD/PC/rubric/block)" },
    ${profileFrag},
    ${overlordFrag},
    "yoe": number
  }
  `;
}

const schemaMap = {
  "junior-esq": ESQ_SCHEMA,
  "junior-behavioral": juniorBehavioralSchema(PROFILE_SCHEMA_FRAGMENT, OVERLORD_SCHEMA_FRAGMENT),
  "senior": seniorSchema(PROFILE_SCHEMA_FRAGMENT, OVERLORD_SCHEMA_FRAGMENT)
};

// Scoring-v2 rubric blocks. Each v2 workstream registers its block as one
// line in this initializer (its text lives in the unit's own rubric file);
// any entry left undefined falls back to the v1 text, so the v2 flag is safe
// to flip before every unit has landed.
export const V2_BLOCKS: {
  common?: string;
  juniorEsq?: string;
  juniorEsqTask?: string;
  juniorBehavioral?: string;
  senior?: string;
  overlord?: string;
  executionContext?: string;
  schemaJuniorEsq?: string;
  schemaProfileFragment?: string;
  schemaOverlordFragment?: string;
} = {
  // Unit A — ESQ v2 "AI-leverage" signal (junior). Input is a deterministic
  // GitHub-signal summary (metadata + regex counts), NOT source code.
  juniorEsq: BLOCK_1_ET_ESQ_V2,
  juniorEsqTask:
    "TASK: Score the ESQ block (A1–A4) only. The INPUT is a deterministic GitHub-signal summary (metadata + regex counts), NOT source code. Score the reported signals against the anchored scales; never invent signals not present in the summary.",
  // schemaJuniorEsq intentionally left unset → falls back to the v1 ESQ schema
  // (A1–A4 + ESQ + justification), which is unchanged for v2.
  // Unit B (role-family anchors + anchored scales): de-biased, anchored rubric text.
  common: COMMON_INSTRUCTIONS_V2,
  juniorBehavioral: BLOCK_2_3_ET_BEHAVIORAL_V2,
  senior: ALL_BLOCKS_EXP_V2,
  // Unit C — Overlord v2: structured verdict + new AI-metric/template-slop
  // detectors. The runner derives the numeric cap from fraud_risk.
  overlord: OVERLORD_RULES_V2,
  schemaOverlordFragment: OVERLORD_SCHEMA_FRAGMENT_V2,
  // Unit D — decision line: v2 drops the 4 operating dimensions from both the
  // prompt (executionContext) and the output schema (schemaProfileFragment),
  // keeping only role_fit + risk_flags. The decision line itself is assembled
  // in code in lib/evaluation-runner.ts.
  executionContext: EXECUTION_CONTEXT_V2,
  schemaProfileFragment: PROFILE_SCHEMA_FRAGMENT_V2,
};

function pick(useV2: boolean, v2Text: string | undefined, v1Text: string): string {
  return useV2 && v2Text ? v2Text : v1Text;
}

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
  currentDate,
  rubricVersion = "v1"
}: {
  context: string;
  mode: "junior-esq" | "junior-behavioral" | "senior";
  currentDate?: string;
  rubricVersion?: "v1" | "v2";
}) {
  const useV2 = rubricVersion === "v2";

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

  const common = pick(useV2, V2_BLOCKS.common, COMMON_INSTRUCTIONS);
  let schemaText = schemaMap[mode];

  if (mode === "junior-esq") {
    rubricText = `${common}\n${pick(useV2, V2_BLOCKS.juniorEsq, BLOCK_1_ET_ESQ)}`;
    taskText = pick(useV2, V2_BLOCKS.juniorEsqTask, "TASK: Score ESQ Block only. Input is GitHub DNA.");
    schemaText = pick(useV2, V2_BLOCKS.schemaJuniorEsq, schemaText);
  }
  else if (mode === "junior-behavioral") {
    rubricText = `${common}\n${pick(useV2, V2_BLOCKS.juniorBehavioral, BLOCK_2_3_ET_BEHAVIORAL)}\n${pick(useV2, V2_BLOCKS.executionContext, EXECUTION_CONTEXT)}\n${pick(useV2, V2_BLOCKS.overlord, OVERLORD_RULES)}`;
    taskText = "TASK: First score PDQ and NR and generate the operating_profile and then execute overlord rules.";
    if (useV2) {
      schemaText = juniorBehavioralSchema(
        V2_BLOCKS.schemaProfileFragment ?? PROFILE_SCHEMA_FRAGMENT,
        V2_BLOCKS.schemaOverlordFragment ?? OVERLORD_SCHEMA_FRAGMENT
      );
    }
  }
  else if (mode === "senior") {
    rubricText = `${common}\n${pick(useV2, V2_BLOCKS.senior, ALL_BLOCKS_EXP)}\n${pick(useV2, V2_BLOCKS.executionContext, EXECUTION_CONTEXT)}\n${pick(useV2, V2_BLOCKS.overlord, OVERLORD_RULES)}`;
    taskText = "TASK: First score OM, OD, and PC and generate the operating_profile and then execute overlord rules.";
    if (useV2) {
      schemaText = seniorSchema(
        V2_BLOCKS.schemaProfileFragment ?? PROFILE_SCHEMA_FRAGMENT,
        V2_BLOCKS.schemaOverlordFragment ?? OVERLORD_SCHEMA_FRAGMENT
      );
    }
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
${schemaText}
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