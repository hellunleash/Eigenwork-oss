/**
 * The canonical, curated EigenBot help text (ADR-010 flow ordering). Lives in its
 * own module so BOTH orchestrators serve the SAME deterministic copy: the router
 * (`loop.ts` help/default intents) and the tool-loop (`tool-loop.ts` help
 * short-circuit). Kept out of `loop.ts` to avoid a loop↔tool-loop import cycle.
 */
export function helpText(): string {
  return [
    "👋 I'm EigenBot — run your hiring end to end right from Slack: open a role, collect and screen applicants, shortlist, advance candidates, and reach out. No dashboard needed. Here's the flow:",
    "1️⃣  *Create an intake link for your role* — paste a JD or describe it; share the link to collect applicants",
    "2️⃣  *Who are my top candidates for <role>?* — see the ranked shortlist once they're in",
    "3️⃣  *Tell me about <candidate>*  ·  *Why is <A> stronger than <B>?* — dig into the shortlist",
    "4️⃣  *Move <candidate> to interview*  ·  *Reject <candidate>* — advance the pipeline",
    "5️⃣  *Draft outreach to <candidate>* — get a ready-to-send email",
    "_Anytime: *which roles are ready to shortlist?*  ·  *how many roles do I have?*_",
  ].join("\n");
}
