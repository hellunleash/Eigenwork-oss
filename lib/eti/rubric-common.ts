export const COMMON_INSTRUCTIONS = `
PRIMARY RULES (Global Across All Blocks)
1. Evidence-Only Evaluation
If something is NOT shown:
You DO NOT reward it.
You DO NOT punish it unless the candidate claims it.

2. Asymmetric Penalty Model
Penalize only when:
A claim is inflated
A claim is contradicted
A claim implies ownership that is unsupported
The timeline or scope is implausible
Missing detail = neutral, not negative.

3. Severity Scaling
Penalties scale by severity:
Severe (−4 to −6): Contradictions, inflated ownership, impossible timelines
Moderate (−2 to −3): Overstated impact, vague responsibilities, buzzword-stacking
Light (−1): Ambiguity or low-detail descriptions with no inflated claims
Never collapse a score because one section is thin. Thin evidence ≠ incompetence.

4. Cross-Block Consistency
You must cross-check:
Resume vs self-description
Responsibilities vs claimed ownership
Seniority vs years of experience
Skills vs projects
Timeline vs scope
Contradictions across blocks → moderate to severe penalties.
Consistency across blocks → bonus (but do not exceed max score).

5. Never Reward Jargon
Tool names, frameworks, and buzzwords DO NOT raise scores unless:
tied to real responsibilities
tied to real system components
tied to debugging or operational behavior
`;

// --- COMMON INSTRUCTIONS (v2: v1 rules + AI-polish neutralization) ---
// Identical global rules to v1, PLUS rule 6 hardening scores against fluent AI-written prose
// and AI-fabricated plausible specificity. Keep this in sync with COMMON_INSTRUCTIONS for rules 1-5.
export const COMMON_INSTRUCTIONS_V2 =
  COMMON_INSTRUCTIONS +
  `
6. Neutralize AI Polish (Prose Quality Earns Nothing)
Fluent, well-structured, or confident writing is NOT evidence and MUST NOT raise any score.
Only VERIFIABLE specifics score: named systems/services/tools tied to real responsibility,
real numbers (scale, latency, volume, %, dates), and concrete failure/decision/debugging stories.

AI-fabricated specificity defense:
- Generic-sounding "specifics" that name NO real system AND cite NO real number are treated as
  vague — they earn NO credit even if phrased precisely or confidently.
- A polished sentence describing "complex distributed systems" or "high-impact optimizations"
  with no named system and no number = vague claim, not a specific.
- This applies especially to NR-C1 (Specificity): plausible-but-unnamed detail CANNOT cross into
  the upper bands. Reaching the upper bands requires at least one named system or real number.
- When uncertain whether a detail is real or AI-generated polish, treat it as polish (no credit),
  consistent with the risk-management posture. Never penalize beyond withholding the credit.
`;