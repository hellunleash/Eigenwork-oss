/**
 * Outreach drafting (ADR-010 Phase 4 capability, platform-side first).
 *
 * Composes a personalized outreach email from a candidate's PERSISTED result
 * card — it never re-reads the resume or re-runs scoring. The personalization is
 * the candidate's own `card.edge` (their standout detail) + `card.title` (their
 * headline), both already jargon-scrubbed at creation (ADR-007 BANNED_TOKEN_RE),
 * so the draft is safe to surface to a recruiter / candidate.
 *
 * Deterministic template (no LLM) by design: instant, free, predictable, and the
 * shared core the Slack agent's `draft_outreach` tool will also call. The email
 * is delivered as a `mailto:` the recruiter sends from their OWN client — we
 * never send autonomously (the human-on-the-trigger gate, ADR-010 guardrail 6).
 */

export type OutreachDraft = { subject: string; body: string };

export type OutreachInput = {
  candidateName?: string | null;
  /** The JD title the recruiter is hiring for. */
  roleTitle?: string | null;
  /** card.title — the candidate's recruiter-facing headline. */
  cardTitle?: string | null;
  /** card.edge — the candidate's standout detail. */
  cardEdge?: string | null;
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

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Compose a subject + body. Every field is optional; the copy degrades cleanly
 * when a detail is missing (no dangling "as a" / "especially your work on").
 */
export function composeOutreach(input: OutreachInput): OutreachDraft {
  const name = firstName(input.candidateName);
  const role = clean(input.roleTitle);
  const title = clean(input.cardTitle);
  const edge = clean(input.cardEdge);
  const recruiter = clean(input.recruiterName);

  const subject = role ? `Quick chat about a ${role} role?` : "Quick chat about an opportunity?";

  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");

  let opener = "I came across your background";
  if (title) opener += ` as a ${title}`;
  opener += edge ? ` and was really impressed — especially your work on ${lowerFirst(edge)}.` : " and was really impressed.";
  lines.push(opener);
  lines.push("");

  const pitch = role
    ? `We're hiring for a ${role} role and I think there could be a strong fit. Would you be open to a short call this week to explore it?`
    : "We're hiring and I think there could be a strong fit. Would you be open to a short call this week to explore it?";
  lines.push(pitch);
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
