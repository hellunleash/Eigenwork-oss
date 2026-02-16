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