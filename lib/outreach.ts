/**
 * Outreach drafting (ADR-010 Phase 4 capability, platform-side first).
 *
 * This is an INTERVIEW-SCHEDULING email — the recruiter has already decided to
 * move forward and wants to set up a call. It deliberately carries NO evaluation
 * content (no `card.edge`/`card.title`, no rubric-derived text of any kind): a
 * candidate's own card fields are recruiter-facing ONLY (they can read as claims-
 * verification / risk-assessment prose — see ADR-007 §8 / rubric-context.ts), so
 * splicing them into a message the CANDIDATE reads was a leak, not a feature —
 * "jargon-scrubbed" (no acronyms) was never the same bar as "safe to send
 * externally." Keep this template purely logistical; if personalization is ever
 * wanted here again, it needs its own explicitly candidate-safe field, never a
 * reuse of `card.edge`/`card.title`.
 *
 * Deterministic template (no LLM) by design: instant, free, predictable, and the
 * shared core across all three callers — the Slack agent's `draft_outreach` tool
 * (both the tool-calling and router paths) and the web app's "Draft outreach"
 * button. The email is delivered as a `mailto:` the recruiter sends from their
 * OWN client — we never send autonomously (the human-on-the-trigger gate, ADR-010
 * guardrail 6).
 */

export type OutreachDraft = { subject: string; body: string };

export type OutreachInput = {
  candidateName?: string | null;
  /** The JD title the recruiter is hiring for. */
  roleTitle?: string | null;
  /** The recruiter's display name, signed at the bottom. */
  recruiterName?: string | null;
};

function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

function clean(s?: string | null): string {
  return (s ?? "").trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
}

/**
 * Compose a subject + body — a plain interview-scheduling message. Every field is
 * optional; the copy degrades cleanly when a detail is missing. Deliberately no
 * per-candidate evaluation content (see file header) — every candidate for a given
 * role gets the same logistics-only message, differing only by name/role/recruiter.
 */
export function composeOutreach(input: OutreachInput): OutreachDraft {
  const name = firstName(input.candidateName);
  const role = clean(input.roleTitle);
  const recruiter = clean(input.recruiterName);

  const subject = role ? `Interview for the ${role} role` : "Let's schedule your interview";

  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");

  lines.push(
    role
      ? `We'd like to move forward with your application for the ${role} role and set up a short interview.`
      : "We'd like to move forward with your application and set up a short interview."
  );
  lines.push("");

  lines.push("Could you share a few times that work for you this week?");
  lines.push("");

  lines.push("Best,");
  lines.push(recruiter || "");

  return { subject, body: lines.join("\n") };
}

/** Build a `mailto:` URL (recipient + pre-filled subject/body) for the draft. */
export function buildMailto(email: string, draft: OutreachDraft): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  // URLSearchParams encodes spaces as "+"; mail clients expect %20 in mailto.
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(email)}?${query}`;
}

export type OutreachItem = {
  name: string;
  email: string | null;
  roleTitle?: string | null;
};

/**
 * Render the bot's recruiter-facing outreach reply (ADR-011 capability gate).
 * Shared by both the router path and the tool path so the gate can't fork.
 *
 *   - PAID org (any active paid pass): full, ready-to-send scheduling drafts for
 *     the whole shortlist, each with a one-click `mailto:` the recruiter sends.
 *   - FREE org: a factual TEASE — ONE real preview (subject + the scheduling
 *     line) plus an upgrade nudge. The value is visible; only sending to the
 *     whole shortlist in one go is gated to a paid plan.
 */
export function renderOutreachReply(items: OutreachItem[], paid: boolean): string {
  if (items.length === 0) return "I couldn't load that candidate's details.";

  if (!paid) {
    const first = items[0];
    const draft = composeOutreach({ candidateName: first.name, roleTitle: first.roleTitle ?? null });
    const askLine = draft.body.split("\n")[2] ?? ""; // the "move forward / set up a call" line
    return [
      `✍️ Here's a preview of the interview outreach I'd send *${first.name}*:`,
      `_Subject:_ ${draft.subject}`,
      askLine,
      "",
      "Ready-to-send scheduling emails for your whole shortlist, one click to your inbox, is on the paid plans. *Upgrade* and I'll draft and queue it for anyone you pick.",
    ].join("\n");
  }

  const parts = items.map((d) => {
    const draft = composeOutreach({ candidateName: d.name, roleTitle: d.roleTitle ?? null });
    if (!d.email) return `*${d.name}* — no email on file, can't draft outreach.`;
    const mailto = buildMailto(d.email, draft);
    return `*${d.name}* — _${draft.subject}_\n${draft.body}\n<${mailto}|📧 Open in your email to send>`;
  });
  return parts.join("\n\n———\n\n");
}
