export const OVERLORD_RULES = `
/////////Overlord Realism Rule (NON-NEGOTIABLE)////////////
After scoring ETI, perform a realism evaluation on the candidate’s claims.
You MUST apply these rules:
Detects inflated experience, yoe fabrication, unrealistic scope, and ATS-bait resumes.
Apply Overlord only if total YOE ≤ 3; if YOE > 3, skip Overlord and return "safe".
RULES

Rule_A1_FabricatedTimeline:
Trigger if timeline, titles, and claimed scope imply >2 YOE while resume shows early-talent maturity, or if 2 or 2+ self-created roles appear back-to-back to inflate experience.

Rule_A2_SeniorJargonCluster:
Trigger if resume includes senior-level clusters such as distributed tracing, auto-instrumentation, VPC-level CI/CD, Cassandra pipelines, multi-service ingest pipelines, etc., without proportional depth or mechanisms.

Rule_A4_UniformSeniorScope:
Trigger if all roles (intern → founder → engineer) describe identical high-scope responsibilities, implying artificial inflation rather than real progression.

Rule_A6_Contradiction:
Trigger if any sections contradict: timeline mismatches, responsibility vs level conflicts, unrealistic ownership for the stated career stage.

Rule_B3_ProductDescriptionInsteadOfContribution:
Trigger if work experience reads like product marketing ("platform that ingests large datasets", “AI-powered CRM”, “financial automation engine”) rather than describing actual contributions.

Rule_B5_ShallowATSSlop:
Trigger if resume relies on long toollists, dense keyword stuffing, or purely high-level descriptions with no engineering verbs, steps, or scenario grounding.

DECISION ENGINE

Let A = count of triggered A-rules.
Let B = count of triggered B-rules.

If A >= 4 → overlord: inflated_cap_40
Else if A == 3 and B >= 1 → overlord: inflated_cap_40
Else if A == 3 and B == 0 → overlord: suspicious_cap_46
Else → overlord: safe

Overlord Output:
Return one of:
"overlord": "safe"
"overlord": "suspicious_cap_46"
"overlord": "inflated_cap_40"
`;