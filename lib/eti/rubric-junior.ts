import { ROLE_ANCHORS } from "./rubric-role-anchors";

// --- ET BLOCKS ---
export const BLOCK_1_ET_ESQ = `
BLOCK 1 — ET Evidence (A1–A4)
ESQ Evaluation:
A1 — Flow Quality (0–10)
How cleanly the engineer structures and moves through the logic.
Score based on:
	•	clarity of control flow
	•	logical ordering of stages
	•	early exits instead of thrash
	•	clean sequencing (parse → sanitize → process → respond)
	•	separation of responsibilities
	•	no spaghetti state
	•	readable path through the file
	•	efficiency-minded flow that avoids redundant or unnecessary work (proxy for speedy execution)
High score: coherent, layered, convergent flow.
Low score: random jumps, chaotic branching, mixed responsibilities.

A2 — Logic Depth (0–10)
How much real engineering thinking exists inside the file.
Score based on:
	•	meaningful decision density
	•	multi-step reasoning
	•	transformations (normalization, mapping, filtering)
	•	multi-stage pipelines
	•	abstraction intelligence
(e.g., intelligent compression of complex inputs into simpler representations)
	•	real reasoning steps rather than shallow glue
	•	avoiding brute-force LLM misuse

High score: strong orchestration + thoughtful multi-step logic.
Low score: trivial CRUD, copy-paste, tutorial-level flow.

A3 — Integration Skill (0–10)
How well the file integrates external systems and handles everything around them.
Score based on:
	•	API/DB/LLM integration correctness
	•	batching, caching, normalization
	•	proper async handling
	•	safe boundaries
	•	error handling + fallbacks
	•	mapping outputs correctly
	•	merging data sources cleanly
	•	low-latency thinking: batching, early filtering, deduping, and minimizing unnecessary calls (proxy for execution speed)
High score: clean pipelines, robustness, low-latency engineering.
Low score: naive calls, no error wrapping, no caching, brute-force loops

A4- Code Maturity / Scar Level (0–5)
Does the file show signs of someone who has shipped real code?
Score based on:
	•	defensive coding
	•	idiomatic style
	•	structured errors
	•	no hardcoded secrets
	•	normalization of inputs
	•	polished interfaces
	•	avoiding anti-patterns
	•	using abstractions intentionally
	•	avoiding junior-level mistakes (god files, random prints, magic strings)

High score: signs of corrections, experience, deliberate structure.
Low score: beginner or AI-glued code.
`
export const BLOCK_2_3_ET_BEHAVIORAL = `
BLOCK 2 — ET PDQ (B1–B3)
You are evaluating problem-solving ability for an Early Talent candidate.
Use ONLY resume, projectDescriptions, and selfDescription as evidence.

SCORING DEFINITIONS:
B1 Decision Reasoning (0–10)
- explains why tools/architecture were chosen only if they were even natually needed in the first place in work scope or context.


B2 Debugging Strategy (0–10)
Infer only from work/project scope and responsibilities:
- system complexity,
- ownership of features/services,
- contexts where debugging is naturally required.
Do NOT assume incidents without supporting context.  
Do NOT reward jargon.  

B3 Speed Signature (0–10)
Evaluate only the speed signals that naturally leak from the resume or project descriptions.
Reward:
• evidence of fast iteration and quick delivery cycles
• MVP-first behavior (prototypes, demos, shipped features)
• simple stack choices that favor speed over aesthetics
• realistic signs of rapid fixes or adaptations
• scope appropriate for a fast-moving junior
Penalize only when claimed speed is unrealistic:
• impossible timelines
• shipping scope that contradicts GitHub evidence
• overblown speed claims (“built X end-to-end in one night”)
• AI-fabricated delivery stories
Absence of speed claims = no penalty.

BLOCK 3 — ET NR (C1–C2)
You are evaluating narrative realism for an Early Talent candidate.
Use ONLY resume + selfDescription as evidence.

SCORING DEFINITIONS:
C1 Specificity (0–10)
- Reward: concrete statements (tools, steps, numbers, scenarios).
- Penalize: vague or generic lines.

C2 Claim Realism (0–10)
- Reward: believable responsibilities for a junior.
- Penalize: inflated leadership/ownership claims.
`;

// --- ET BLOCKS (v2: role-family-equivalent + anchored) ---
// Same JSON keys as v1 (pdq_breakdown.B1..B3, nr_breakdown.C1..C2) — keys MUST NOT change.
// Difference vs v1: role-family-aware (no backend bias) + explicit numeric band anchors.
export const BLOCK_2_3_ET_BEHAVIORAL_V2 = `
${ROLE_ANCHORS}

BLOCK 2 — ET PDQ (pdq_breakdown: B1-B3)
You are evaluating problem-solving ability for an Early Talent candidate.
Use ONLY resume, projectDescriptions, and selfDescription as evidence.
Score against the candidate's OWN family using the evidence-equivalence table above.

SCORING DEFINITIONS:
B1 Decision Reasoning (0–10)
- Explains WHY tools/architecture/approaches were chosen, only if such a choice was naturally
  needed in the work scope or context (judged per the candidate's family).
- Anchors: 0–2 no reasoning / name-dropping only, 3–5 partial rationale, 6–8 clear rationale tied
  to a real constraint, 9–10 strong rationale with concrete tradeoffs and a named system/number.

B2 Debugging Strategy (family-equivalent) (0–10)
Infer only from work/project scope and responsibilities. Use the [Troubleshooting] row of the
equivalence table for the candidate's family (e.g. flaky-test isolation for QA, perf regressions
for Frontend, broken-pipeline recovery for Data Eng, drift investigation for ML).
Do NOT assume incidents without supporting context. Do NOT reward jargon.
- Anchors: 0–2 none/generic, 3–5 basic debugging implied, 6–8 a concrete debugging/RCA story,
  9–10 a hard, verifiable problem solved with a specific approach.

B3 Speed Signature (0–10)
Evaluate only the speed signals that naturally leak from the resume or project descriptions.
Reward: evidence of fast iteration and quick delivery cycles; MVP-first behavior (prototypes,
demos, shipped features); simple stack choices that favor speed; realistic rapid fixes; scope
appropriate for a fast-moving junior.
Penalize only when claimed speed is unrealistic: impossible timelines; scope contradicting
GitHub evidence; overblown claims ("built X end-to-end in one night"); AI-fabricated stories.
Absence of speed claims = no penalty.
- Anchors: 0–2 unrealistic/contradicted speed claims, 3–5 some shipping signal, 6–8 credible
  fast-iteration evidence, 9–10 multiple concrete, verifiable rapid-delivery specifics.

BLOCK 3 — ET NR (nr_breakdown: C1-C2)
You are evaluating narrative realism for an Early Talent candidate.
Use ONLY resume + selfDescription as evidence.

SCORING DEFINITIONS:
C1 Specificity (0–10)
- Reward: concrete, VERIFIABLE statements (named systems/tools, real numbers, concrete steps or
  scenarios) appropriate to the candidate's family.
- Penalize: vague or generic lines.
- HARDENING vs AI-fabricated specificity: fluent, plausible-sounding "specifics" that name NO real
  system and cite NO real number earn NO credit and CANNOT exceed the 3–5 band. Adjectives and
  smooth prose are not evidence. Reaching 6–10 requires at least one named system or real number.
- Anchors: 0–2 vague/generic, 3–5 plausible but unverifiable, 6–8 one+ concrete named specific,
  9–10 multiple corroborating verifiable specifics.

C2 Claim Realism (0–10)
- Reward: believable responsibilities for a junior (in the candidate's family).
- Penalize: inflated leadership/ownership claims.
- Anchors: 0–2 clearly inflated, 3–5 mostly believable, 6–8 well-calibrated to a junior,
  9–10 realistic and corroborated by concrete specifics.
`;
