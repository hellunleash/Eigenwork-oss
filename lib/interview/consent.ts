/**
 * AEDT / automated-screening candidate notice (Phase 2). Versioned so the recorded
 * consent is auditable (the LL144-style "assistive tool" posture: disclose that an
 * automated tool assists, a human decides). Shown on the candidate screen page; the
 * version is stamped on the round when the candidate consents before submitting.
 * Pure constants — safe to import from client + server.
 */
export const AEDT_NOTICE_VERSION = "2026-07-09";

export const AEDT_NOTICE_TEXT =
  "This screen uses an automated tool to generate questions and draft an assessment of your answers. " +
  "It is assistive only — a person on the hiring team reviews the assessment and makes every decision. " +
  "Your answers are processed to produce that assessment and stored with your application. " +
  "By submitting, you consent to this automated processing.";
