/**
 * Finalist-report presentation (Phase 2, Step 4). PURE — turns a compiled
 * `FinalistReport` into the three delivery shapes (plain-text summary, email, Slack
 * Block Kit) with NO IO, so one dossier renders identically in-app, over email, and in
 * an in-thread Slack drop. Unit-tested by scripts/qa-interview-foundation.ts.
 *
 * Assistive posture is preserved in the copy: the recommendation is always framed as a
 * suggestion, and the disclaimer rides along.
 */
import type { FinalistReport, ReportRecommendation } from "@/lib/interview/report";
import type { Scorecard } from "@/lib/interview/rounds";

const REC_LABEL: Record<ReportRecommendation["suggested"], string> = {
  advance: "Advance (suggested)",
  hold: "Hold — judgment call",
  pass: "Pass (suggested)",
  incomplete: "Incomplete — rounds still pending",
};

function scoreLine(label: string, sc: Scorecard | null | undefined): string {
  if (!sc) return `${label}: not scored`;
  return `${label}: ${sc.overall}/100 (${sc.suggestedAdvance ? "advance" : "below bar"})`;
}

/** PURE. A compact plaintext dossier — the shared body for email + Slack + previews. */
export function buildReportSummaryText(report: FinalistReport): string {
  const r = report.rounds;
  const lines: string[] = [];
  lines.push(`Finalist report — ${report.candidateName} · ${report.roleTitle} (${report.track})`);
  lines.push("");
  lines.push(`Recommendation: ${REC_LABEL[report.recommendation.suggested]}`);
  lines.push(`  ${report.recommendation.rationale}`);
  lines.push("");
  lines.push("Résumé / ETI signal:");
  lines.push(`  score: ${report.resume.score ?? "n/a"}`);
  if (report.resume.card?.title) lines.push(`  headline: ${report.resume.card.title}`);
  if (report.resume.card?.edge) lines.push(`  standout: ${report.resume.card.edge}`);
  if (report.resume.card?.flag) lines.push(`  flag: ${report.resume.card.flag}`);
  lines.push("");
  lines.push("Interview rounds:");
  if (r.introCall) lines.push(`  intro call: ${r.introCall.status}${r.introCall.note ? ` — ${r.introCall.note}` : ""}`);
  lines.push(`  ${scoreLine("screen", r.screen)}`);
  lines.push(`  ${scoreLine("take-home", r.takeHome?.scorecard)}${r.takeHome?.repoUrl ? ` — ${r.takeHome.repoUrl}` : ""}`);
  lines.push(`  ${scoreLine("system design", r.systemDesign)}`);
  if (report.whatToProbe.length) {
    lines.push("");
    lines.push("What to probe in the final:");
    for (const p of report.whatToProbe) lines.push(`  • ${p}`);
  }
  lines.push("");
  lines.push(report.disclaimer);
  return lines.join("\n");
}

/** PURE. Email {subject, body} — the founder opens/sends it from their own client. */
export function buildReportEmail(report: FinalistReport): { subject: string; body: string } {
  return {
    subject: `Finalist report — ${report.candidateName} (${report.roleTitle})`,
    body: buildReportSummaryText(report),
  };
}

/** A minimal Block Kit shape (kept local so this module doesn't couple to the agent). */
type Block = Record<string, unknown>;
const section = (text: string): Block => ({ type: "section", text: { type: "mrkdwn", text } });

/** PURE. Slack Block Kit blocks for an in-thread report drop. */
export function buildReportSlackBlocks(report: FinalistReport): Block[] {
  const r = report.rounds;
  const blocks: Block[] = [
    { type: "header", text: { type: "plain_text", text: `Finalist: ${report.candidateName}`.slice(0, 150) } },
    section(`*${report.roleTitle}* · ${report.track}\n*Recommendation:* ${REC_LABEL[report.recommendation.suggested]}\n_${report.recommendation.rationale}_`),
    section(
      [
        `*Score:* ${report.resume.score ?? "n/a"}`,
        scoreLine("*Screen*", r.screen),
        scoreLine("*Take-home*", r.takeHome?.scorecard),
        scoreLine("*System design*", r.systemDesign),
      ].join("\n")
    ),
  ];
  if (report.whatToProbe.length) {
    blocks.push(section(`*What to probe in the final:*\n${report.whatToProbe.map((p) => `• ${p}`).join("\n")}`));
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: report.disclaimer }] });
  return blocks;
}
