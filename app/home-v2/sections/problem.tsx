export function Problem() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header block */}
        <div className="max-w-3xl mb-16 r-item">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
            THE PROBLEM
          </p>
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            Reading r&eacute;sum&eacute;s isn&rsquo;t catching the people who can&rsquo;t ship &mdash; or the ones whose claims don&rsquo;t match the work.
          </h2>
          <p className="mt-6 text-sm font-mono text-zinc-500">
            Last quarter&rsquo;s Series B backend role: 47 applicants, 4 interviewed, 1 ghosted before offer, 0 hires.
          </p>
        </div>

        {/* Problems grid — asymmetric: middle panel is taller (row-span-2) */}
        <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-[auto_auto] gap-6 auto-rows-min">
          {/* Panel 1 */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 flex flex-col md:row-span-1 r-item" style={{ transitionDelay: "0.06s" }}>
            <p className="text-xs font-mono text-zinc-500 mb-4 tracking-wider">
              01 / R&Eacute;SUM&Eacute; THEATRE
            </p>
            <h3 className="text-xl md:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-3 leading-snug">
              Every r&eacute;sum&eacute; claims the stack.
            </h3>
            <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              None of them prove they shipped it. You interview 50 on vibes and miss the 5 who can actually ship.
            </p>
          </div>

          {/* Panel 2 (TALL — spans both rows, has extra mock readout) */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 flex flex-col md:row-span-2 r-item" style={{ transitionDelay: "0.12s" }}>
            <p className="text-xs font-mono text-zinc-500 mb-4 tracking-wider">
              02 / TAKE-HOME FATIGUE
            </p>
            <h3 className="text-xl md:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-3 leading-snug">
              Good engineers won&rsquo;t do your take-home.
            </h3>
            <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Six-hour LeetCode sets scare off candidates who already have offers. The ones who finish are usually the ones who can&rsquo;t get hired anywhere.
            </p>
            <div className="mt-auto pt-6 border-t border-zinc-100 dark:border-white/[0.06]">
              <ul className="text-xs font-mono space-y-2 text-zinc-500">
                <li>Of 50 take-home invites:</li>
                <li>&rarr; 12 finished</li>
                <li>&rarr; 8 were the wrong half</li>
              </ul>
            </div>
          </div>

          {/* Panel 3 */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-8 flex flex-col md:row-span-1 r-item" style={{ transitionDelay: "0.18s" }}>
            <p className="text-xs font-mono text-zinc-500 mb-4 tracking-wider">
              03 / INFLATED PROFILES SLIP THROUGH
            </p>
            <h3 className="text-xl md:text-2xl font-medium text-zinc-900 dark:text-zinc-100 mb-3 leading-snug">
              Inflated profiles slip through your screen.
            </h3>
            <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              AI-written r&eacute;sum&eacute;s. Inflated portfolios. Repos staged in a day. By interview three you&rsquo;ve burned a week and the candidate ghosts.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
