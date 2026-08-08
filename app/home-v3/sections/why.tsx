// =============================================================================
// v3 "Why EigenWork" — the drench moment. The page's belief system gets the
// page's one saturated surface: deep evidence-green, sticky thesis with the
// struck-through "keywords" (the brand gesture), five edges scrolling past
// with ticks that draw in. Copy identical to the live Why section.
// NOT wrapped in <Reveal> by the composition — a transformed ancestor would
// break position: sticky.
// =============================================================================

import { Reveal } from "../motion";

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
    <section
      id="why"
      className="py-24 md:py-36 scroll-mt-14 border-y border-emerald-200/[0.08]"
      style={{ backgroundColor: "var(--v3-drench)" }}
    >
      <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-y-16 lg:gap-x-20">
        {/* Thesis — sticks while the reasons scroll past */}
        <div className="lg:sticky lg:top-28 self-start">
          <p className="text-sm font-semibold text-emerald-300">Why EigenWork</p>
          <h2 className="v3-display mt-5 text-[2.6rem] md:text-6xl font-semibold leading-[0.98] text-emerald-50 text-balance">
            Most tools match{" "}
            <span className="text-emerald-200/50 line-through decoration-2 decoration-emerald-200/40">
              keywords
            </span>
            . We read the <span className="text-emerald-300">work</span>.
          </h2>
          <p className="mt-7 text-lg text-emerald-100/85 leading-relaxed max-w-sm text-pretty">
            And doubt the rest &mdash; the difference between a pile of plausible résumés and a
            shortlist you can actually act on.
          </p>
        </div>

        {/* The reasons */}
        <Reveal stagger className="space-y-14 md:space-y-16">
          {EDGES.map((e, i) => (
            <div key={e.claim} className="r-item max-w-xl" style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="v3-tick block w-10 h-[3px] rounded-full bg-emerald-300 mb-5" aria-hidden="true" />
              <h3 className="v3-display text-2xl md:text-[2rem] font-medium leading-[1.1] text-emerald-50 text-balance">
                {e.claim}
              </h3>
              <p className="mt-3 text-base md:text-lg text-emerald-100/80 leading-relaxed text-pretty">
                {e.body}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
