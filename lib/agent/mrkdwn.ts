/**
 * Normalize standard Markdown (which the synthesis model emits) into Slack mrkdwn
 * before posting. Slack does NOT understand `**bold**`, `__bold__`, `# headings`,
 * or `[text](url)` links — left as-is they render as literal asterisks/brackets and
 * read as broken output. This is output polish only (ADR-010/011); it never changes
 * meaning, just the asterisk/heading/link syntax.
 *
 * Deliberately conservative: it only collapses DOUBLE markers, so copy that already
 * uses correct single-asterisk Slack bold (e.g. the move_stage confirm) is untouched.
 */
export function toSlackMrkdwn(s: string): string {
  if (!s) return s;
  return s
    // **bold** / __bold__  ->  *bold*  (Slack bold). Non-greedy, single-line.
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "*$1*")
    // Markdown headings (### Title) -> bold line.
    .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, "*$1*")
    // [text](https://url) -> <https://url|text>  (Slack link form).
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .trim();
}
