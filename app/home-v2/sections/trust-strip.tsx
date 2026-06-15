"use client";

// =============================================================================
// /home-v2 — Trust strip + customer logos (Unit 3 of homepage-v2 redesign).
// Logos scroll as an infinite marquee; the outcome stats count up when the
// strip scrolls into view. Both collapse to a static state under reduced motion
// (handled by globals.css + the motion hooks).
//
// Voice contract: NO internal scoring acronyms, NO engine vocabulary,
// NO numeric scores, NO mention of per-screen overage pricing. Outcome-first
// copy only. Audience = recruiters / founders / hiring managers, not engineers.
// =============================================================================

import { useInView, useCountUp } from "../motion";

export function TrustStrip() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <section className="py-16 md:py-20 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* ------- Row 1: customer logos (marquee) -------------------------- */}
        <p className="text-center text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-8">
          Trusted by hiring teams at
        </p>
        <div className="marquee-mask relative overflow-hidden">
          <div className="flex w-max animate-marquee text-zinc-400 dark:text-zinc-600">
            <LogoRow />
            <LogoRow ariaHidden />
          </div>
        </div>

        {/* ------- Divider -------------------------------------------------- */}
        <div className="border-t border-zinc-200 dark:border-white/[0.08] my-16" />

        {/* ------- Row 2: outcome stat tiles (count up in view) ------------- */}
        <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">
          <Stat start={inView} prefix="<" countTo={90} suffix="s" label="per applicant" sub="résumé to ranked" />
          <Stat start={inView} countTo={90} suffix="%" label="less résumé pile" sub="to read" />
          <Stat start={inView} value="Before the call" label="inflated profiles surfaced" sub="(not after)" />
          <Stat start={inView} countTo={60} suffix="s" label="to live" sub="no integration" />
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
      <p className="text-xs text-zinc-400 mt-1">{sub}</p>
    </div>
  );
}

// ---------- Marquee row -----------------------------------------------------
// One full set of logos. Rendered twice inside the track; -50% translate loops
// seamlessly. The duplicate is aria-hidden so screen readers see one set.

function LogoRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-x-12 md:gap-x-16 pr-12 md:pr-16"
      aria-hidden={ariaHidden || undefined}
    >
      <NimbusLogo />
      <LatticeForgeLogo />
      <NorthstarLabsLogo />
      <QuintileLogo />
      <HexbridgeLogo />
      <VectorTypeLogo />
    </div>
  );
}

// ---------- Customer logos --------------------------------------------------
// Each logo is an inline SVG mark + wordmark, sized ~h-7 for the mark.
// All carry currentColor so the parent text color drives them.

// MOCK CUSTOMER LOGO — replace when real customers ship
function NimbusLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx={14} cy={14} r={9} />
        <circle cx={14} cy={14} r={3.5} fill="currentColor" stroke="none" />
      </svg>
      <span className="text-base font-medium tracking-tight">Nimbus</span>
    </div>
  );
}

// MOCK CUSTOMER LOGO — replace when real customers ship
function LatticeForgeLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        <path d="M14 3.5 L24.5 14 L14 24.5 L3.5 14 Z" />
        <path d="M14 8.5 L19.5 14 L14 19.5 L8.5 14 Z" fill="currentColor" stroke="none" />
      </svg>
      <span className="text-base font-medium tracking-tight">Lattice Forge</span>
    </div>
  );
}

// MOCK CUSTOMER LOGO — replace when real customers ship
function NorthstarLabsLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="currentColor">
        {/* 4-pointed star: two crossed slim diamonds */}
        <path d="M14 1 L16 14 L14 27 L12 14 Z" />
        <path d="M1 14 L14 12 L27 14 L14 16 Z" />
      </svg>
      <span className="text-base font-medium tracking-tight">Northstar Labs</span>
    </div>
  );
}

// MOCK CUSTOMER LOGO — replace when real customers ship
function QuintileLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        {/* Regular pentagon, point up, centered on (14,14), circumradius ~10.5 */}
        <path d="M14 3.5 L23.99 10.76 L20.17 22.5 L7.83 22.5 L4.01 10.76 Z" />
      </svg>
      <span className="text-base font-medium tracking-tight">Quintile</span>
    </div>
  );
}

// MOCK CUSTOMER LOGO — replace when real customers ship
function HexbridgeLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
        {/* Pointy-top hexagon centered on (14,14), circumradius ~10.5 */}
        <path d="M14 3.5 L23.09 8.75 L23.09 19.25 L14 24.5 L4.91 19.25 L4.91 8.75 Z" />
        <path d="M9.5 14 L18.5 14" />
      </svg>
      <span className="text-base font-medium tracking-tight">Hexbridge</span>
    </div>
  );
}

// MOCK CUSTOMER LOGO — replace when real customers ship
function VectorTypeLogo() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7" fill="currentColor">
        {/* Angled (right-leaning) triangle suggesting motion / a play arrow */}
        <path d="M5 4 L24 14 L5 24 Z" />
      </svg>
      <span className="text-base font-medium tracking-tight">Vector Type</span>
    </div>
  );
}
