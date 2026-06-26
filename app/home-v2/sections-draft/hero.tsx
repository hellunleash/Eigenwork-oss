"use client";

// =============================================================================
// DRAFT hero — Slack-native thesis. The product IS the hero: a Slack thread that
// shows the whole loop (post a role → best-fit shortlist → a role-critical reason
// WITH an honest caveat → offered next steps).
//
// Voice of the bot: consultative. It ASKS first ("full list or best fits?"),
// OFFERS the next move as choices (résumé / why ranked higher / draft intro), and
// never claims to verify — it reads the work and flags what doesn't hold up.
//
// Impeccable: NO uppercase-mono eyebrow (the audit's top per-section AI tell); one
// card (the thread), messages are rows not nested cards; EigenWork palette, never
// Slack aubergine (purple is banned in product UI).
// =============================================================================

import type { ReactNode } from "react";

export function Hero({ onCta }: { onCta: () => void }) {
  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
      <DotGrid />
      <div className="relative max-w-[1200px] mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left — copy */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.03] px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <HashGlyph className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Built for technical hiring
          </span>

          <h1 className="mt-6 text-4xl md:text-6xl font-medium tracking-[-0.04em] leading-[1.0] text-zinc-900 dark:text-zinc-100">
            Hire your next engineer, right from{" "}
            <span className="text-emerald-600 dark:text-emerald-400">Slack</span>.
          </h1>

          <p className="mt-6 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-[52ch]">
            Post a role, get a ranked shortlist, ask why anyone&rsquo;s on it, and reach out &mdash;
            in your hiring channel, or in the full web app. Same engine behind both: it reads the
            actual work, and flags the ones who don&rsquo;t hold up.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCta}
              className="group inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Add to Slack
              <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={onCta}
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-transparent border border-zinc-300 dark:border-white/[0.15] rounded-full hover:border-zinc-400 dark:hover:border-white/[0.3] transition-colors"
            >
              Start free
            </button>
          </div>

          <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Free to start · no card · no new tab to adopt
          </p>
        </div>

        {/* Right — Slack thread */}
        <div className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-6">
            <div className="absolute right-0 top-4 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="absolute left-2 bottom-6 h-40 w-40 rounded-full bg-teal-300/10 blur-3xl" />
          </div>
          <div className="relative z-10">
            <SlackThread />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Slack thread mock -----------------------------------------------

function SlackThread() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-sm overflow-hidden">
      {/* Channel header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center gap-2">
        <HashGlyph className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">hiring</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-black ring-1 ring-white/[0.14] text-white text-[8px] font-bold leading-none">E</span>
          EigenWork
        </span>
      </div>

      <div className="p-4 space-y-5">
        <Msg name="Priya" avatar="P" avatarClass="bg-amber-500" time="9:41 AM">
          <span className="text-emerald-600 dark:text-emerald-400">@EigenWork</span> hiring a senior
          backend engineer, payments. Can you take applicants?
        </Msg>

        <Bot time="9:41 AM">
          <p>
            On it. Here&rsquo;s your link to share &rarr;{" "}
            <span className="text-emerald-600 dark:text-emerald-400">eigenwork.com/apply/sr-backend</span>.
            Once they&rsquo;re in &mdash; want the <strong className="font-semibold text-zinc-900 dark:text-zinc-100">full ranked list</strong>,
            or just the <strong className="font-semibold text-zinc-900 dark:text-zinc-100">best fits</strong> for what matters most here?
          </p>
        </Bot>

        <Msg name="Priya" avatar="P" avatarClass="bg-amber-500" time="9:43 AM">
          best fits &mdash; it&rsquo;s payments, so correctness matters most
        </Msg>

        <Bot time="9:43 AM">
          <p>
            Then I&rsquo;m weighting production ownership of money-critical systems. Top pick:{" "}
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Maya Rodriguez</strong> &mdash; owned a
            billing ledger at ~2M transactions/day and drove the fix that killed their double-charge
            incidents. That&rsquo;s the reliability this role lives on.
          </p>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            One caveat: it&rsquo;s all been at one company on a mature system &mdash; worth probing whether
            she can stand one up from scratch, not just run one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>Why Maya, not Dev?</Chip>
            <Chip>Show me her résumé</Chip>
            <Chip>Draft an intro</Chip>
          </div>
        </Bot>
      </div>
    </div>
  );
}

function Msg({
  name,
  avatar,
  avatarClass,
  time,
  children,
}: {
  name: string;
  avatar: string;
  avatarClass: string;
  time: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-xs font-semibold text-white ${avatarClass}`}>
        {avatar}
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{name}</span>
          <span className="text-[11px] text-zinc-400">{time}</span>
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Bot({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-9 h-9 rounded-md bg-black ring-1 ring-white/[0.14] flex items-center justify-center text-white text-base font-bold leading-none">
        E
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">EigenWork</span>
          <span className="inline-flex items-center px-1.5 py-px rounded bg-zinc-100 dark:bg-white/[0.08] text-[9px] font-semibold tracking-wide text-zinc-500 dark:text-zinc-400 uppercase">
            App
          </span>
          <span className="text-[11px] text-zinc-400">{time}</span>
        </p>
        <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-1">{children}</div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.02] text-xs font-medium text-zinc-700 dark:text-zinc-300">
      {children}
    </span>
  );
}

// ---------- Background + icons ----------------------------------------------

function DotGrid() {
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none dark:hidden"
        aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle, #e5e5e5 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden dark:block"
        aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
    </>
  );
}

function HashGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function ArrowRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
