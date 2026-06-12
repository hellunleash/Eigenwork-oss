// --- ROLE-FAMILY ANCHORS (v2) ---
// Shared rubric text injected into the v2 senior/junior blocks.
// Goal: de-bias scoring so EVERY technical IT family can reach the top band
// on EQUIVALENT evidence (not only backend SWE). Two parts:
//   (1) role-family classification + per-dimension evidence-equivalence table
//   (2) explicit numeric band anchors that cut model variance.
export const ROLE_ANCHORS = `
=== ROLE-FAMILY ANCHORS (apply before scoring) ===

STEP 0 — Classify the candidate into EXACTLY ONE family using resume + selfDescription.
Pick the dominant family from the actual work, not job titles or buzzwords:
  • Backend/Fullstack      — services, APIs, business logic, server + DB work
  • Frontend/Mobile        — web/mobile UIs, client perf, accessibility, design-system work
  • DevOps/SRE/Platform    — infra, IaC, CI/CD platforms, rollout/runbook ownership, SLOs
  • ML Eng/MLOps           — training/serving pipelines, inference endpoints, model lifecycle
  • Data Eng               — pipelines/ETL/ELT, warehouses/lakes, orchestration, data contracts
  • Data Analyst/BI        — SQL modeling, metric governance, dashboards, analysis correctness
  • QA/SDET                — test automation, release-gate ownership, CI test suites, flaky-test triage
  • Security               — threat modeling, secure-SDLC gates, vuln remediation, detection/response
If genuinely split, choose the family carrying the most ownership weight and note it in the justification.

CORE PRINCIPLE — EVIDENCE EQUIVALENCE:
Each scoring dimension below names a backend-flavored default AND its equivalent for other
families. Equivalent evidence earns EQUIVALENT scores. A Data Analyst, QA engineer, or SRE
can reach the TOP band on their family's evidence. Backend-style work (auth, payments,
distributed systems) is ONE valid path to a high score, NOT the only path. Do NOT down-score
a candidate merely because their work is not backend/SWE. Do NOT up-score backend buzzwords
that are not tied to real responsibility.

EVIDENCE-EQUIVALENCE TABLE (read the row for the candidate's family):

[Troubleshooting / problem-solving depth]  (senior A1 / junior B2)
  • Backend/Fullstack : production incidents, debugging across services, data-corruption fixes
  • Frontend/Mobile   : cross-browser/device defects, perf regressions, state/race-condition bugs
  • DevOps/SRE        : outage diagnosis, rollback execution, capacity/latency firefighting
  • ML Eng/MLOps      : training-/serving-failure diagnosis, data/label bugs, drift investigation
  • Data Eng          : broken-pipeline recovery, backfills, schema-drift and late-data handling
  • Data Analyst/BI   : tracing wrong metrics to source, reconciling discrepancies, data-quality RCA
  • QA/SDET           : root-causing flaky tests, isolating intermittent defects, triage discipline
  • Security          : incident response, exploit reproduction, root-cause of vuln classes

[Deployment / delivery / CI-CD]  (senior A2)
  • Backend/Fullstack : service rollout, CI/CD pipelines, migrations, environment management
  • Frontend/Mobile   : web/app-store release pipelines, staged rollout, feature flags, bundle delivery
  • DevOps/SRE        : owning the deploy platform itself, IaC, progressive delivery, runbooks
  • ML Eng/MLOps      : model serving / inference endpoints, retraining + serving pipelines, promotion
  • Data Eng          : pipeline scheduling/orchestration, deployment of jobs, data SLAs
  • Data Analyst/BI   : governed report/dashboard publishing, semantic-layer/version control of models
  • QA/SDET           : release-gate ownership, test-suite in CI, flaky-test triage, gating builds
  • Security          : secure-SDLC gates in CI, policy-as-code, automated security checks in pipeline

[Reliability / monitoring / quality guarantees]  (senior A3)
  • Backend/Fullstack : SLOs, alerting, error budgets, failure-mode awareness for services
  • Frontend/Mobile   : crash/error monitoring, Core Web Vitals/perf budgets, regression guards
  • DevOps/SRE        : SLO/SLI definition, on-call, error budgets, capacity & resilience
  • ML Eng/MLOps      : model correctness, latency/throughput budgets, drift control, eval gates
  • Data Eng          : data-quality checks, freshness/SLA monitoring, lineage, idempotent reprocessing
  • Data Analyst/BI   : metric correctness, validation/reconciliation, governance of definitions
  • QA/SDET           : coverage/defect-escape metrics, suite stability, regression prevention
  • Security          : detection coverage, MTTR on vulns, control effectiveness, hardening verification

[Complexity of owned components]  (senior B2)
  • Backend/Fullstack : auth, payments, distributed/transactional logic, high-throughput systems
  • Frontend/Mobile   : complex stateful UIs, offline/realtime, design systems, render-perf at scale
  • DevOps/SRE        : multi-environment infra, multi-region rollout, platform abstractions
  • ML Eng/MLOps      : end-to-end ML systems, feature stores, low-latency serving, eval/retrain loops
  • Data Eng          : large-scale pipelines, partitioning/performance, exactly-once, data contracts
  • Data Analyst/BI   : complex multi-CTE SQL models, metric governance, data-correctness at scale
  • QA/SDET           : frameworks/harnesses, parallelized suites, deterministic infra for flaky systems
  • Security          : threat models for complex systems, cross-cutting controls, secure architecture
  Do NOT penalize "purely CRUD" for families where CRUD is not the relevant axis — judge
  complexity by the family's hardest legitimate work.

[Scope, autonomy, alignment, coherence, trajectory]  (B1/B3, C1-C3, junior B1/B3, NR)
  Judge these the SAME across families: depth of ownership, independent decision-making,
  responsibilities matching YOE, a consistent story, and a coherent progression — measured
  against the candidate's own family, never against a backend default.

=== NUMERIC BAND ANCHORS (use to reduce variance; map evidence to the band, then pick a point) ===

For /10 dimensions:
  0–2  : no credible evidence, or only generic/jargon claims; CRUD-only or tutorial-level scope.
  3–5  : real but shallow ownership; partial responsibility; routine tasks within a bounded area.
  6–8  : solid family-appropriate ownership with concrete, verifiable specifics (named systems,
         real numbers, or a concrete failure/decision story).
  9–10 : deep, hard, verifiable ownership of the family's most demanding work, with multiple
         independent concrete specifics that corroborate each other.

For /5 dimensions (senior A4-equivalents, C3; junior A4):
  0–1  : absent, generic, or contradicted.
  2–3  : present but thin / partially supported.
  4–5  : clearly demonstrated with concrete, verifiable specifics.

Anchoring rules:
  • A claim with NO named system AND NO real number AND NO concrete story cannot exceed the
    3–5 band (or 2–3 on /5). Fluent, well-written prose is NOT evidence and earns nothing.
  • Reaching 9–10 (or 4–5) REQUIRES verifiable specifics, not adjectives.
  • Apply these anchors per the candidate's family using the equivalence table above.
`;
