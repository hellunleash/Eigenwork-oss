// =============================================================================
// DRAFT /home-v2 — Slack agent section (ADR-010, phases 1–4).
// Sells the conversational front door: ask "who's strongest and why", mint an
// intake link, move stages, draft outreach — all in Slack, in plain English.
//
// Honesty:
//   • The bot answer is recruiter-language only (guardrail 7 jargon scrub) — no
//     ESQ/PDQ/block names. Figures (99.99% uptime, ~38% own commits) read from
//     the candidate's persisted card / github_metrics — never re-scored.
//   • Outreach is a mailto: the recruiter sends from their own inbox (guardrail 6
//     hard gate) — reflected in the caption, never "we email candidates".
//   • Tiers: chat on every plan incl. Free (lower daily limits); outreach paid-only.
//
// Impeccable notes: NO uppercase-mono eyebrow here (the audit flagged the
// every-section eyebrow as the top AI tell — this section deliberately breaks the
// cadence). One card (the thread); messages are rows, not nested cards. EigenWork
// palette, not Slack aubergine (purple is banned in product UI).
// =============================================================================

export function SlackAgent() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        {/* Left — copy */}
        <div>
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            It answers in the channel you already live in.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            No new tab to adopt. Ask EigenWork in Slack and it reads back from the screens it
            already ran — in plain English, with the evidence.
          </p>

          <ul className="mt-8 space-y-4">
            <Capability title="Ask who's strongest — and why">
              A real answer from the work, not a score. &ldquo;Compare the top 3&rdquo;, &ldquo;explain that risk flag&rdquo;.
            </Capability>
            <Capability title="Mint an intake link, right there">
              &ldquo;We&rsquo;re hiring a senior backend dev, remote&rdquo; → a working link plus share copy to drop in your network.
            </Capability>
            <Capability title="Move a candidate, or draft the outreach">
              &ldquo;Move Maya to interview.&rdquo; &ldquo;Draft a note to the top 3.&rdquo; You send it from your own inbox — it never emails for you.
            </Capability>
          </ul>

          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-200 dark:border-white/[0.08] pt-5">
            In Slack on <span className="text-zinc-700 dark:text-zinc-200 font-medium">every plan</span> — Free included, with lower daily limits.
            Outreach drafting on paid plans.
          </p>
        </div>

        {/* Right — Slack thread mock */}
        <SlackThread />
      </div>
    </section>
  );
}

// ---------- Capability row --------------------------------------------------

function Capability({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>
        <span className="text-sm md:text-base font-medium text-zinc-900 dark:text-zinc-100">{title}.</span>{" "}
        <span className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">{children}</span>
      </span>
    </li>
  );
}

// ---------- Slack thread mock -----------------------------------------------

function SlackThread() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-sm overflow-hidden">
      {/* Channel header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center gap-2">
        <span className="text-zinc-400 dark:text-zinc-500 text-base leading-none">#</span>
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">hiring</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <BotMark className="w-3.5 h-3.5" />
          EigenWork
        </span>
      </div>

      {/* Messages */}
      <div className="p-4 space-y-5">
        {/* Recruiter */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-md bg-amber-500 flex items-center justify-center text-xs font-semibold text-white">P</span>
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Priya</span>
              <span className="text-[11px] text-zinc-400">9:41 AM</span>
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400">@EigenWork</span> who&rsquo;s our strongest backend applicant, and why?
            </p>
          </div>
        </div>

        {/* Bot */}
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-md bg-emerald-500 flex items-center justify-center text-white">
            <BotMark className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">EigenWork</span>
              <span className="inline-flex items-center px-1.5 py-px rounded bg-zinc-100 dark:bg-white/[0.08] text-[9px] font-semibold tracking-wide text-zinc-500 dark:text-zinc-400 uppercase">App</span>
              <span className="text-[11px] text-zinc-400">9:41 AM</span>
            </p>
            <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mt-1 space-y-2">
              <p>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">Maya Rodriguez.</span> She owned billing
                at scale — 99.99% uptime — and led a 3-team monolith → event-driven migration. That ownership is exactly
                what this role needs.
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                Closest alt is Aditya, but only ~38% of his repo&rsquo;s commits are his own — worth probing in the screen.
              </p>
            </div>
            {/* Quick-reply chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>Compare top 3</Chip>
              <Chip>Draft outreach to Maya</Chip>
              <Chip>Move to interview</Chip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.02] text-xs font-medium text-zinc-700 dark:text-zinc-300">
      {children}
    </span>
  );
}

// ---------- Mark ------------------------------------------------------------

function BotMark({ className = "w-4 h-4" }: { className?: string }) {
  // Simple spark/check mark — stands in for the EigenWork app glyph.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z" />
    </svg>
  );
}
