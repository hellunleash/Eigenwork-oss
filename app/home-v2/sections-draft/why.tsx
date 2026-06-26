// =============================================================================
// DRAFT — "Why EigenWork", impeccable `bolder` pass.
// The prior version sat in the editorial-restraint lane brand.md flags (rule-
// separated rows + muted monochrome = the 2026 reflex). Reworked into a bolder
// PRODUCT composition: a committed emerald thesis that STICKS while the reasons
// scroll past, extreme type-scale + weight contrast, a struck-through "keywords",
// short emerald accent ticks, generous whitespace.
//
// On-brand (emerald/zinc, no purple), existing font, WCAG-safe body text.
// Rendered WITHOUT <Reveal> in DraftLanding so there's no transformed ancestor —
// `position: sticky` resolves against the viewport, and it trims one instance of
// the uniform scroll-reveal tell. Honesty: "reads / doubts", never "verifies".
// =============================================================================

type Edge = { claim: string; body: string };

const EDGES: Edge[] = [
  {
    claim: "It reads the work, not the wording.",
    body:
      "Real code and shipped systems for early-career engineers; the track record the work actually backs for seniors. Now that AI writes the résumé and the take-home, the work is the last thing that’s hard to fake.",
  },
  {
    claim: "It’s skeptical on purpose.",
    body:
      "EigenWork assumes the résumé is selling you something. It cross-checks every claim against the evidence and flags what doesn’t add up — padded scope, suspiciously round “improved-by-40%” metrics, a repo built in a weekend and dressed up as a career.",
  },
  {
    claim: "Every role, on its own terms.",
    body:
      "A data engineer isn’t graded on a backend yardstick. EigenWork knows what good looks like across backend, frontend, mobile, data, ML, DevOps, QA, and security — and judges each candidate against their own field.",
  },
  {
    claim: "A reason, not a number.",
    body:
      "Every candidate comes with a one-line, evidence-backed case you can paste into a calibration doc or defend to a hiring manager — plus the single thing worth probing in the interview.",
  },
  {
    claim: "It lives where you already work.",
    body:
      "Ask in Slack, dig in on the web, and — soon — let the screened shortlist land in your own ATS. No new tool to adopt, no pipeline to migrate.",
  },
];

export function Why() {
  return (
    <section id="why" className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a] scroll-mt-14">
      <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-y-14 lg:gap-x-20">
        {/* Thesis — the focal point; sticks while the reasons scroll past */}
        <div className="lg:sticky lg:top-28 self-start">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Why EigenWork</p>
          <h2 className="mt-4 text-[2.5rem] md:text-6xl font-medium tracking-[-0.04em] leading-[0.95] text-zinc-900 dark:text-zinc-100 text-balance">
            Most tools match{" "}
            <span className="text-zinc-400 dark:text-zinc-500 line-through decoration-2 decoration-zinc-300 dark:decoration-zinc-700">
              keywords
            </span>
            . We read the <span className="text-emerald-600 dark:text-emerald-400">work</span>.
          </h2>
          <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm text-pretty">
            And doubt the rest &mdash; the difference between a pile of plausible résumés and a
            shortlist you can actually act on.
          </p>
        </div>

        {/* The reasons */}
        <div className="space-y-12 md:space-y-14">
          {EDGES.map((e) => (
            <div key={e.claim} className="max-w-xl">
              <span className="block w-9 h-[3px] rounded-full bg-emerald-500 mb-5" aria-hidden="true" />
              <h3 className="text-2xl md:text-[2rem] font-medium tracking-[-0.02em] leading-[1.1] text-zinc-900 dark:text-zinc-100 text-balance">
                {e.claim}
              </h3>
              <p className="mt-3 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty">
                {e.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
