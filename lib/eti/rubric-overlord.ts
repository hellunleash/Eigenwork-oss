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

// Scoring-v2 Overlord. Behavioral changes vs v1:
//   1. Emits a STRUCTURED verdict ({ verdict, fraud_risk, triggered[] }) instead
//      of a bare cap string. The numeric cap is NOT chosen by the model — the
//      runner derives it from fraud_risk (see applyOverlordCap in
//      lib/evaluation-runner.ts). The model only reports risk + evidence.
//   2. Adds two new detectors (G1 uniform AI metrics, G2 template slop) on top
//      of the v1 rule set, which is carried over verbatim.
//   3. The "skip if YOE > 3" short-circuit is REMOVED — v2 runs Overlord on
//      seniors too. Senior CAP ENFORCEMENT is gated in code behind
//      ETI_OVERLORD_ENFORCE_SENIOR (shadow mode); the model still reports the
//      verdict regardless so trigger rates can be observed before enforcing.
export const OVERLORD_RULES_V2 = `
/////////Overlord Realism Rule v2 (NON-NEGOTIABLE)////////////
After scoring ETI, perform a realism evaluation on the candidate's claims.
Detect inflated experience, YOE fabrication, unrealistic scope, AI-fabricated
metrics, template/keyword slop, and ATS-bait resumes.
Run Overlord for EVERY candidate regardless of YOE. Do NOT skip.
You report risk and evidence; you do NOT decide the numeric score cap.
RULES

Rule_A1_FabricatedTimeline:
Trigger if timeline, titles, and claimed scope imply >2 YOE while resume shows early-talent maturity, or if 2 or 2+ self-created roles appear back-to-back to inflate experience.

Rule_A2_SeniorJargonCluster:
Trigger if resume includes senior-level clusters such as distributed tracing, auto-instrumentation, VPC-level CI/CD, Cassandra pipelines, multi-service ingest pipelines, etc., without proportional depth or mechanisms.

Rule_A4_UniformSeniorScope:
Trigger if all roles (intern -> founder -> engineer) describe identical high-scope responsibilities, implying artificial inflation rather than real progression.

Rule_A6_Contradiction:
Trigger if any sections contradict: timeline mismatches, responsibility vs level conflicts, unrealistic ownership for the stated career stage.

Rule_B3_ProductDescriptionInsteadOfContribution:
Trigger if work experience reads like product marketing ("platform that ingests large datasets", "AI-powered CRM", "financial automation engine") rather than describing actual contributions.

Rule_B5_ShallowATSSlop:
Trigger if resume relies on long toollists, dense keyword stuffing, or purely high-level descriptions with no engineering verbs, steps, or scenario grounding.

Rule_G1_UniformAIMetrics:
Trigger if nearly every bullet ends in a quantified outcome of the same shape ("improved X by 40%", "reduced Y by 30%", "increased Z by 50%") with implausibly round/uniform percentages and no methodology, baseline, or measurement context. Uniform stamped metrics across most bullets strongly indicate AI-fabricated impact rather than real measurement.

Rule_G2_TemplateSlop:
Trigger if the resume reads as a filled-in template: keyword-stuffed skill walls, generic responsibility phrasing repeated across roles, and an absence of concrete engineering verbs, mechanisms, trade-offs, or scenario detail. Distinct from B5 in that it targets template-shaped uniformity (same phrasing scaffold reused) rather than raw tool-list density.

DECISION ENGINE

Let A = count of triggered A-rules (A1, A2, A4, A6).
Let B = count of triggered B-rules (B3, B5).
Let G = count of triggered G-rules (G1, G2).

Estimate fraud_risk in [0,1] from the weight and number of triggers:
- More A-rules and any G-rule push fraud_risk up sharply.
- A == 0 and B == 0 and G == 0 -> fraud_risk near 0.0 (safe).
- Strong inflation (A >= 3, or A >= 2 with any G) -> fraud_risk >= 0.66.
- Moderate concern (A == 2, or A == 1 with B/G, or G == 2) -> fraud_risk in 0.4..0.65.
- Weak/no concern -> fraud_risk < 0.4.

Map fraud_risk to verdict ONLY for your own consistency (the runner re-derives the cap):
- fraud_risk >= 0.66 -> verdict "inflated"
- fraud_risk >= 0.4  -> verdict "suspicious"
- else               -> verdict "safe"

Overlord Output (STRUCTURED — replaces the v1 bare string):
"overlord": {
  "verdict": "safe" | "suspicious" | "inflated",
  "fraud_risk": number between 0 and 1,
  "triggered": [ { "id": "Rule_A1_FabricatedTimeline", "reason": "short phrase" } ]
}
Keep "triggered" to only the rules that actually fired. Keep each "reason" a short phrase (<=12 words). If nothing fires, return verdict "safe", fraud_risk 0, and an empty "triggered" array.
`;