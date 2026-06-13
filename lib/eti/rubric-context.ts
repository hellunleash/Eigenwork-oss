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
// operating-profile reading chore with a structured result card (title +
// edge + optional flag) — see ADR-007. The model emits the three recruiter-
// facing strings directly inside the operating_profile object under strict
// banned-token constraints; a CPU fallback in lib/cards/fallback.ts replaces
// any field that is missing or jargon-tainted.
export const EXECUTION_CONTEXT_V2 = `
ROLE FIT, RISK & RESULT CARD SYNTHESIS
Do NOT re-read the resume.
Synthesize role_fit, risk_flags, and the THREE recruiter-facing card fields
(title, edge, flag) directly from the score and justifications you already
computed from the blocks above, and from the work_history you extracted in
the overlord step.

ABSOLUTE WORDING RULES (apply to title, edge, flag, risk_flags, and
triggered[].reason — every recruiter-facing string):
- Plain recruiter language. NEVER use the rubric internal labels ESQ, PDQ,
  NR, OM, OD, PC, or the words "rubric", "block", "justification". These
  have no meaning to recruiters and break the result card if surfaced.
- Cite specific evidence (employer/role names, signal field values, project
  verbs). No vague adjectives.

Role Fit
- Extract:
    • title → concise industry-standard title(must not contain the word "intern" as its a work type not title.)
    • primary → single core language/stack(max 2 items) (e.g., Python, Node, Java, C#, Go)
    • secondary → key supporting frameworks/tools (array)
    • tertiary → optional tools (array)
- Output a one_liner in this format ONLY:
    "<title> (<primary> | <secondary comma-separated> | <tertiary comma-separated>)"
- Do NOT include the words "primary", "secondary", "tertiary" in the one_liner.
- Do NOT hallucinate tools not present in the resume.

Risk Flags
- Only flag explicit contradictions, impossible timelines, fabricated claims, or mutually inconsistent facts.
Do NOT flag vague wording, missing metrics, broad tool lists, or lack of detailed process explanation.

Title (recruiter card headline, <=60 chars)
Pick ONE of the three patterns below in priority order:
1. Brand chip:   "<X> yrs at <bucket> · <role>"   when work_history has at
   least one entry whose brand_bucket is FAANG / YC / tier-1 AND
   round(years_at_that_employer) >= 1. Use the highest-tier entry
   (FAANG > tier-1 > YC); within a tier pick max years. Use "1 yr" for
   exactly one year, "<N> yrs" otherwise.
2. Role + stack: "<role> (<primary>)"   when no bucket-matched entry
   exists but role_fit.title and role_fit.primary are both present.
3. Bare role:    "<role>"   or "Candidate" when nothing else is available.

Edge (recruiter card sentence, <=25 words)
ONE sharp sentence about the candidate's strongest piece of evidence (or
the weakness that defines them when the case is borderline). Cite specific
facts: project name + numbers, employer + scope, named tech with context.
Do NOT blend across many points; pick the single most distinguishing one.

Flag (recruiter card alert, null on clean candidates)
Emit a string ONLY when a fraud-shaped risk is real:
- The overlord step produced any triggered[] entries (use a humanized
  version of the strongest one).
- A deterministic GitHub fraud tell is present (e.g. the GitHub signal
  summary shows all_in_one_day with >3 commits).
Otherwise emit null. Do NOT use the flag for skill gaps, scope concerns,
tenure questions, or stack mismatches — those are NOT fraud and surface
elsewhere on the card.
`;