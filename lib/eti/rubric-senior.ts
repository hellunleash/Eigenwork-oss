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
