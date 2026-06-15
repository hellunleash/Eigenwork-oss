// =============================================================================
// Why EigenWork section (home-v2 redesign).
// Asymmetric 4x2 bento grid: 1 large hero tile + 5 smaller tiles. Recruiter-
// facing copy — no engine vocabulary, no engineer acronyms. Self-contained
// inline SVG icons; no icon library, no animation library.
// =============================================================================

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-1 shrink-0 text-emerald-500 dark:text-emerald-400"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function Why() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
            WHY EIGENWORK
          </div>
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] text-zinc-900 dark:text-zinc-100 leading-[1.1]">
            Built for the shape of technical hiring — not generic résumé filters.
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4">
          {/* Tile A — LARGE 2x2 hero */}
          <div className="col-span-1 md:col-span-2 row-span-1 md:row-span-2 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 md:p-10 flex flex-col">
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
              We read the work, not the wording.
            </h3>
            <p className="text-base text-zinc-500 mt-2 mb-8">
              The code itself for early-career engineers; the track record behind the claims for experienced ones.
            </p>
            <div className="border-l-2 border-zinc-200 dark:border-white/[0.1] pl-5 space-y-3 my-6">
              <div className="flex items-start gap-2.5 text-sm md:text-base text-zinc-700 dark:text-zinc-300">
                <CheckIcon />
                <span>Built CI/CD from scratch</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm md:text-base text-zinc-700 dark:text-zinc-300">
                <CheckIcon />
                <span>100% solo commits over 8 weeks</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm md:text-base text-zinc-700 dark:text-zinc-300">
                <CheckIcon />
                <span>Careful error handling throughout</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm md:text-base text-zinc-700 dark:text-zinc-300">
                <CheckIcon />
                <span>Real production patterns, not tutorial copy-paste</span>
              </div>
            </div>
            <div className="mt-auto pt-4 text-xs font-mono text-zinc-400">
              — from a real candidate review
            </div>
          </div>

          {/* Tile B — defensible recommendation */}
          <div className="col-span-1 md:col-span-2 row-span-1 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-[#101013] p-8">
            <h3 className="text-xl md:text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
              Every candidate comes with a recommendation you can defend.
            </h3>
            <p className="mt-4 text-lg md:text-xl text-zinc-700 dark:text-zinc-300 leading-snug font-medium">
              &ldquo;Owned billing at scale shipping 99.99% uptime; led 3-team monolith → event-driven migration.&rdquo;
            </p>
            <div className="mt-4 text-xs font-mono text-zinc-500">
              — the kind of sentence you can paste into a calibration doc.
            </div>
          </div>

          {/* Tile C — surface inflated profiles */}
          <div className="col-span-1 md:col-span-1 row-span-1 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-6 md:p-8">
            <h3 className="text-lg md:text-xl font-medium text-zinc-900 dark:text-zinc-100">
              We surface inflated profiles.
            </h3>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Repos built in a single day. Résumés that claim more than the code shows. Commit patterns that don&rsquo;t add up. We surface them before you book the call.
            </p>
          </div>

          {/* Tile D — zero setup */}
          <div className="col-span-1 md:col-span-1 row-span-1 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-6 md:p-8">
            <h3 className="text-lg md:text-xl font-medium text-zinc-900 dark:text-zinc-100">
              Zero setup tax.
            </h3>
            <div className="mt-3 text-xs md:text-sm font-mono text-zinc-600 dark:text-zinc-400 tracking-wider">
              0 ATS · 0 SDR · 0 DEMO · 0 FORM
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Paste a JD, share one link, watch the pipeline rank itself.
            </p>
          </div>

          {/* Tile E — pricing */}
          <div className="col-span-1 md:col-span-2 row-span-1 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8">
            <h3 className="text-lg md:text-xl font-medium text-zinc-900 dark:text-zinc-100">
              Priced per role, not per seat.
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="border-l-2 border-red-300 pl-4">
                <div className="text-xs font-mono uppercase tracking-wider text-red-700 dark:text-red-400">
                  GENERIC ATS
                </div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                  $$$$ / seat / month
                </div>
              </div>
              <div className="border-l-2 border-emerald-400 pl-4">
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  EIGENWORK
                </div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                  $149 / role · pay once
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-zinc-500">
              No SaaS subscription gotchas.
            </div>
          </div>

          {/* Tile F — candidates finish */}
          <div className="col-span-1 md:col-span-2 row-span-1 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8">
            <h3 className="text-lg md:text-xl font-medium text-zinc-900 dark:text-zinc-100">
              Candidates actually finish your screen.
            </h3>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              60-second submission. No timed coding gauntlet. Strong engineers who already have offers finish it — your funnel doesn&rsquo;t collapse.
            </p>
            <div className="mt-4 inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-mono">
              60 SEC / MEDIAN SUBMISSION
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
