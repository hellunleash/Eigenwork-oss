/**
 * Phase 2 (AI interviews) master feature flag.
 *
 * OFF unless explicitly enabled, so merging Phase 2 code NEVER changes prod
 * behavior (isolation contract, docs/phase2-plan.md). Every Phase 2 route / agent
 * tool / entry point must gate on this — when it's off they no-op or 404, so the
 * whole feature is dark in prod until `PHASE2_INTERVIEWS_ENABLED=true` is set.
 */
export function interviewsEnabled(): boolean {
  return process.env.PHASE2_INTERVIEWS_ENABLED === "true";
}
