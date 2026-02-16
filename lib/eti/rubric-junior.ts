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
