"use client";

// =============================================================================
// DRAFT /home-v2 — Outcome stat band (de-cluttered).
// The fake customer-logo marquee ("Trusted by hiring teams at" + 6 invented
// logos) was REMOVED — no real customers to show yet, so it was theatre.
// What's left: four HONEST outcome stats, each defensible against the product
// as it ships today (90s/applicant, 60s setup, flag-before-the-call, free start).
//
// Voice contract: NO internal scoring acronyms, NO numeric scores, outcome-first.
// =============================================================================

import { useInView, useCountUp } from "../motion";

export function TrustStrip() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="py-16 md:py-20 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div
          ref={ref}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center"
        >
          <Stat start={inView} prefix="<" countTo={90} suffix="s" label="per applicant" sub="résumé to ranked" />
          <Stat start={inView} value="Before the call" label="inflated profiles flagged" sub="not after" />
          <Stat start={inView} countTo={60} suffix="s" label="to set up" sub="no integration" />
          <Stat start={inView} value="$0" label="to start" sub="no card, no demo" />
        </div>
      </div>
    </section>
  );
}

// ---------- Stat tile -------------------------------------------------------

function Stat({
  start,
  countTo,
  prefix = "",
  suffix = "",
  value,
  label,
  sub,
}: {
  start: boolean;
  countTo?: number;
  prefix?: string;
  suffix?: string;
  value?: string;
  label: string;
  sub: string;
}) {
  const n = useCountUp(countTo ?? 0, { start: start && countTo != null });
  const display = countTo != null ? `${prefix}${n}${suffix}` : value ?? "";
  return (
    <div>
      <p className="text-3xl md:text-4xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">
        {display}
      </p>
      <p className="text-sm text-zinc-500 mt-2">{label}</p>
      <p className="text-xs text-zinc-500 mt-1">{sub}</p>
    </div>
  );
}
