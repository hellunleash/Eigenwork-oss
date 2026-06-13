import { ROLE_ANCHORS } from "./rubric-role-anchors";

// --- EXP BLOCKS ---//
export const ALL_BLOCKS_EXP = `
BLOCK 1 — EXP Evidence(A1-A3)
You are evaluating operational maturity for an Experienced candidate (>=2 YOE).
Use ONLY resume + selfDescription.
DO NOT use GitHub, folderTree, manifest, or dnaFiles.
Impt instruction for data/ml roles: (Treat ML/Data equivalents below as alternative forms of operational responsibility , not additional requirements.)
SCORING DEFINITIONS:
A1 Troubleshooting / Incidents / (ML/Data equivalent of Troubleshooting)
Evaluate real problem-solving maturity.  
Infer only from work scope and responsibilities:
- system complexity,
- ownership of features/services,
- contexts where debugging is naturally required.
Do NOT assume incidents without supporting context.  
Do NOT reward jargon.  
Score the troubleshooting depth implied by actual work.

A2 Deployment / CI/CD / (ML/Data equivalent of Deployment)
Evaluate delivery and environment awareness.  
Use role → responsibilities → deployment context mapping:
- whether their work even requires CI/CD interaction,
- whether changes imply rollout or environment behavior.
Do NOT treat tool names as evidence.  
Score only when deployment responsibility is supported by the resume.
(For ML/Data roles, treat responsibility for model serving, inference endpoints, application integration, or maintaining automated retraining/serving flows as deployment ownership.)

A3 Reliability / Monitoring / SLO / (ML/Data equivalent of Reliability)
Evaluate reliability thinking shown through real responsibilities:
- systems where reliability naturally matters (APIs, data flows, services),
- signs of stability, performance, or failure-mode awareness.
Do NOT require SRE terminology.  
Do NOT infer reliability for purely CRUD or low-impact scopes.  
Score the depth of reliability mindset implied by the work.
(For ML/Data roles, treat maintaining model correctness, latency/FPS budgets, drift control, data quality guarantees, or stable inference behavior as reliability responsibility.)
BLOCK 2 — EXP OD (B1-B3)
You are evaluating Ownership Depth for an Experienced candidate.
Use ONLY resume + selfDescription + projectDescriptions.

SCORING DEFINITIONS:
B1 Scope of Ownership (0–10)
- Reward: owning modules/features/systems.
- Penalize: only ticket-level contributions.

B2 Complexity of Owned Components (0–10)
- Reward: auth, payment systems, infra, distributed logic.
- Penalize: purely CRUD roles.

B3 Autonomy (0–10)
- Reward: independent execution, planning, decision-making.
- Penalize: high supervision dependency.

BLOCK 3 — EXP PC (C1–C3)
You are evaluating Plausibility & Coherence for an Experienced candidate.
Use ONLY resume + selfDescription.

SCORING DEFINITIONS:
C1 Role-Experience Alignment (0–10)
- Reward: responsibilities match years of experience.
- Penalize: inflated claims.

C2 Claim-Responsibility Coherence (0–10)
- Reward: consistent story across resume/project descriptions.
- Penalize: contradictions and Deduct points if resume language implies senior ownership, production rigor, or autonomy not proportional to role duration, scope, or demonstrated accountability.

C3 Career Trajectory Structure (0-5)
-Reward: clear, time-ordered progression in roles or scope across career timeline.
-Penalize: unclear sequencing, abrupt unexplained transitions, or missing continuity
`;

// --- EXP BLOCKS (v2: role-family-equivalent + anchored) ---
// Same JSON keys as v1 (om_breakdown.A1..A3, od_breakdown.B1..B3, pc_breakdown.C1..C3)
// — the runner sums by key, so keys MUST NOT change. Difference vs v1: every dimension
// is role-family-equivalent (no backend bias) and carries explicit numeric band anchors.
export const ALL_BLOCKS_EXP_V2 = `
${ROLE_ANCHORS}

JUSTIFICATION VOICE (applies to om_breakdown.justification, od_breakdown.justification, pc_breakdown.justification):
- <=25 words each.
- Recruiter language only. NEVER use the rubric labels ESQ, PDQ, NR, OM, OD, PC,
  or the words "rubric", "block", "justification" — these have no meaning to
  recruiters and the downstream card path falls back when they appear.
- Cite specific evidence (project verbs, named systems/tools, employer + role).

BLOCK 1 — EXP Evidence (om_breakdown: A1-A3)
You are evaluating operational maturity for an Experienced candidate (>=2 YOE).
Use ONLY resume + selfDescription.
DO NOT use GitHub, folderTree, manifest, or dnaFiles.
Score against the candidate's OWN family using the evidence-equivalence table above.
Backend-style work is one valid path to a high score, never the only one.

SCORING DEFINITIONS:
A1 Troubleshooting / Incidents (family-equivalent) (0–10)
Evaluate real problem-solving maturity from actual work scope and responsibilities:
- system/data complexity, ownership of features/services/pipelines/suites,
- contexts where debugging or root-cause analysis is naturally required.
Use the [Troubleshooting] row of the equivalence table for the candidate's family.
Do NOT assume incidents without supporting context. Do NOT reward jargon.
Apply numeric anchors: 0–2 none/generic, 3–5 real-but-shallow, 6–8 solid+specific, 9–10 deep+multi-specific.

A2 Deployment / Delivery / CI-CD (family-equivalent) (0–10)
Evaluate delivery and environment awareness via role → responsibilities → delivery context.
Use the [Deployment] row: e.g. for QA/SDET = release-gate ownership, test-suite in CI,
flaky-test triage; for MLOps = model serving/inference endpoints + retraining/serving pipelines;
for DevOps/SRE = owning the deploy platform, IaC, progressive delivery, runbooks;
for Data Analyst/BI = governed report/dashboard publishing + versioned semantic models.
Do NOT treat tool names as evidence. Score only when delivery responsibility is supported.
Apply numeric anchors: 0–2 none/generic, 3–5 real-but-shallow, 6–8 solid+specific, 9–10 deep+multi-specific.

A3 Reliability / Monitoring / Quality guarantees (family-equivalent) (0–10)
Evaluate reliability thinking shown through real responsibilities. Use the [Reliability] row:
e.g. SLOs/alerting (Backend/SRE), crash/perf budgets (Frontend/Mobile), drift control + eval gates
(MLOps), data-quality/freshness checks + lineage (Data Eng), metric correctness + reconciliation
(Data Analyst/BI), defect-escape/coverage stability (QA), detection coverage + MTTR (Security).
Do NOT require SRE terminology. Do NOT infer reliability for purely generic or low-impact scopes.
Do NOT penalize a family simply because its reliability axis is not backend uptime.
Apply numeric anchors: 0–2 none/generic, 3–5 real-but-shallow, 6–8 solid+specific, 9–10 deep+multi-specific.

BLOCK 2 — EXP OD (od_breakdown: B1-B3)
You are evaluating Ownership Depth for an Experienced candidate.
Use ONLY resume + selfDescription + projectDescriptions.

SCORING DEFINITIONS:
B1 Scope of Ownership (0–10)
- Reward: owning modules/features/systems/pipelines/suites/dashboards (family-appropriate).
- Penalize: only ticket-level contributions.
- Anchors: 0–2 ticket-level only, 3–5 owns a bounded area, 6–8 owns a component/system end-to-end,
  9–10 owns critical multi-part systems with verifiable scope.

B2 Complexity of Owned Components (family-equivalent) (0–10)
Use the [Complexity] row for the candidate's family. Examples of TOP-band complexity:
- Backend/Fullstack: auth, payments, distributed/transactional logic.
- Data Analyst/BI: complex multi-CTE SQL models, metric governance, data-correctness at scale.
- MLOps: low-latency serving, feature stores, eval/retrain loops.
- DevOps/SRE: multi-region rollout, platform abstractions, IaC at scale.
- Frontend/Mobile: complex stateful/offline/realtime UIs, render-perf at scale.
- QA/SDET: frameworks/harnesses, deterministic infra for flaky systems.
- Security: threat models + cross-cutting controls for complex systems.
Judge complexity by the family's hardest LEGITIMATE work. Do NOT penalize "purely CRUD" for
families where CRUD is not the relevant axis.
- Anchors: 0–2 trivial/CRUD-only-when-relevant, 3–5 moderate, 6–8 genuinely complex+specific,
  9–10 the family's most demanding work, verifiably owned.

B3 Autonomy (0–10)
- Reward: independent execution, planning, decision-making.
- Penalize: high supervision dependency.
- Anchors: 0–2 fully directed, 3–5 some independence, 6–8 self-directed on real scope,
  9–10 drives ambiguous, high-stakes work independently.

BLOCK 3 — EXP PC (pc_breakdown: C1-C3)
You are evaluating Plausibility & Coherence for an Experienced candidate.
Use ONLY resume + selfDescription. Judge these dimensions the SAME across families.

SCORING DEFINITIONS:
C1 Role-Experience Alignment (0–10)
- Reward: responsibilities match years of experience (in the candidate's family).
- Penalize: inflated claims.
- Anchors: 0–2 clearly inflated for the YOE, 3–5 roughly plausible, 6–8 well-aligned,
  9–10 responsibilities and YOE corroborate each other with concrete specifics.

C2 Claim-Responsibility Coherence (0–10)
- Reward: consistent story across resume/project descriptions.
- Penalize: contradictions. Deduct if language implies senior ownership, production rigor, or
  autonomy not proportional to role duration, scope, or demonstrated accountability.
- Anchors: 0–2 contradictory, 3–5 mostly consistent with gaps, 6–8 coherent throughout,
  9–10 tightly corroborated across all sections.

C3 Career Trajectory Structure (0–5)
- Reward: clear, time-ordered progression in roles or scope across career timeline.
- Penalize: unclear sequencing, abrupt unexplained transitions, or missing continuity.
- Anchors: 0–1 incoherent/missing, 2–3 partially clear, 4–5 clean, well-explained progression.
`;
