// =============================================================================
// DRAFT — "Why you can trust what it tells you" (3 pillars).
// Replaces the old 6-tile Why bento with three compressed reasons that back the
// Slack answers: it reads the work (not keywords), it flags the fakes, and YOU
// stay in control. The web dashboard/analytics is demoted to a single closing
// line (Slack is the product; the dashboard is the optional deep-dive).
//
// Honesty: "reads / flags", never "verifies". Impeccable: no eyebrow kicker;
// three peer columns, not a card grid of icon+heading+text clones.
// =============================================================================

import type { ReactNode } from "react";

export function Trust() {
  return (
    <section className="py-20 md:py-28 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="max-w-2xl text-3xl md:text-4xl font-medium tracking-[-0.03em] leading-[1.1] text-zinc-900 dark:text-zinc-100">
          Why you can trust what it tells you.
        </h2>

        <div className="mt-12 grid md:grid-cols-3 gap-10 md:gap-12">
          <Pillar icon={<IconCode />} title="It reads the work, not the wording">
            The code itself for early-career engineers; the track record behind the claims for
            seniors. The ranking reflects what they can actually do &mdash; not which keywords they
            listed.
          </Pillar>
          <Pillar icon={<IconFlag />} title="It flags the ones who don’t hold up">
            Padded résumés, repos staged in a day, claims the work doesn&rsquo;t back. EigenWork
            surfaces them in the answer &mdash; before you spend an interview finding out.
          </Pillar>
          <Pillar icon={<IconHand />} title="You stay in control">
            It asks before it acts, drafts outreach but never sends it, and every answer is yours to
            dig into. No black box, no autonomous emails.
          </Pillar>
        </div>
      </div>
    </section>
  );
}

function Pillar({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-medium text-zinc-900 dark:text-zinc-100">{title}.</h3>
      <p className="mt-2 text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">{children}</p>
    </div>
  );
}

// ---------- Icons -----------------------------------------------------------

function IconCode() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function IconHand() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 11V6a2 2 0 114 0v5m0 0V4a2 2 0 114 0v7m0 0V7a2 2 0 114 0v8a6 6 0 01-6 6h-2.5a6 6 0 01-4.6-2.2l-3.1-3.8a2 2 0 013-2.6L7 14" />
    </svg>
  );
}
