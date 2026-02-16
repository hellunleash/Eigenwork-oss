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