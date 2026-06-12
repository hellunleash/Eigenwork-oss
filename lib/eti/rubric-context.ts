export const EXECUTION_CONTEXT = `
OPERATING PROFILE SYNTHESIS
Do NOT re-read the resume.
Synthesize the "Operating Profile" directly from the *score and justifications* you already computed from the 3 blocks.

Ramp Expectation
-Output one concise, evidence-based sentence explaining the ramp level with context. Be specific and not vague.

Supervision Load
-Output one concise, evidence-based sentence explaining the supervision level, explicitly referencing autonomy or lack of decision ownership

Role Fit
- Extract:
    • title → concise industry-standard title(must not contain the word "intern" as its a work type not title.)
    • primary → single core language/stack(max 2 items) (e.g., Python, Node, Java, C#, Go)
    • secondary → key supporting frameworks/tools (array)
    • tertiary → optional tools (array)
- Output a one_liner in this format ONLY:
    "<title> (<primary> | <secondary comma-separated> | <tertiary comma-separated>)"
- Do NOT include the words “primary”, “secondary”, “tertiary” in the one_liner.
- Do NOT hallucinate tools not present in the resume.

Risk Flags
- Only flag explicit contradictions, impossible timelines, fabricated claims, or mutually inconsistent facts.
Do NOT flag vague wording, missing metrics, broad tool lists, or lack of detailed process explanation.
`;

// Scoring-v2 execution context. The four operating dimensions (ramp,
// supervision, stack-transfer, reliability) are dropped: v2 replaces the
// operating-profile reading chore with a single recruiter decision line that
// is assembled deterministically in code (see assembleDecisionLine in
// lib/evaluation-runner.ts), NOT emitted by the model. The model therefore
// produces ONLY role_fit + risk_flags here; everything else in the line is
// derived from the sub-scores/justifications already computed.
export const EXECUTION_CONTEXT_V2 = `
ROLE FIT & RISK SYNTHESIS
Do NOT re-read the resume.
Synthesize role_fit and risk_flags directly from the *score and justifications* you already computed from the blocks.
Do NOT output any operating-profile dimensions and do NOT write a summary/decision sentence — those are assembled downstream.

Role Fit
- Extract:
    • title → concise industry-standard title(must not contain the word "intern" as its a work type not title.)
    • primary → single core language/stack(max 2 items) (e.g., Python, Node, Java, C#, Go)
    • secondary → key supporting frameworks/tools (array)
    • tertiary → optional tools (array)
- Output a one_liner in this format ONLY:
    "<title> (<primary> | <secondary comma-separated> | <tertiary comma-separated>)"
- Do NOT include the words “primary”, “secondary”, “tertiary” in the one_liner.
- Do NOT hallucinate tools not present in the resume.

Risk Flags
- Only flag explicit contradictions, impossible timelines, fabricated claims, or mutually inconsistent facts.
Do NOT flag vague wording, missing metrics, broad tool lists, or lack of detailed process explanation.
`;