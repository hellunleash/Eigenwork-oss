/**
 * Shared candidate-CSV builder. The recruiter-facing screening export — rank,
 * name, score, location, work auth, and the result-card fields (headline / edge /
 * flag / role fit). Deliberately EXCLUDES contact PII (email, resume link): a bulk
 * export shouldn't dump emails into a Slack channel, and the per-candidate email /
 * resume lives behind get_candidate / draft_outreach. Both the web results page and
 * the Slack bot's export_candidates tool build their CSV through here (no fork).
 */

export type CandidateExportRow = {
  rank: number;
  name: string;
  score: number | null;
  location: string;
  workAuth: string;
  /** card.title — the recruiter-facing headline. */
  title: string;
  edge: string;
  flag: string;
  roleFit: string;
};

export const CANDIDATE_CSV_HEADERS = [
  "Rank",
  "Name",
  "Score",
  "Location",
  "Work Auth",
  "Headline",
  "Edge",
  "Flag",
  "Role Fit",
] as const;

/** RFC-4180 cell: quote when the value contains a comma, quote, or newline. */
export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the CSV text (header + one row per candidate). Newline-joined — callers
 *  that need an Excel-friendly file prepend a BOM + use CRLF; the Slack bot posts
 *  it verbatim in a code block, so a plain `\n` join is right here. */
export function buildCandidateCsv(rows: CandidateExportRow[]): string {
  const lines = [CANDIDATE_CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.rank, r.name, r.score ?? "", r.location, r.workAuth, r.title, r.edge, r.flag, r.roleFit].map(csvCell).join(",")
    );
  }
  return lines.join("\n");
}
