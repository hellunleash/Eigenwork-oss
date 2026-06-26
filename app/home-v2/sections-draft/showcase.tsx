// =============================================================================
// DRAFT — result / Showcase, rewritten per Arhaan:
//   • NO green/yellow status pills (dropped the emerald "Strong fit" / amber
//     "Worth a screen" badges and the status-colored avatars). Cards are neutral.
//   • Exactly ONE candidate flagged, for a critical reason (staged repo / claims
//     the work doesn't back) — not a flag on everyone.
//   • Human, role-critical reasoning for a payments-backend role — no metric soup
//     like "38% of commits are his". Reasons read like a sharp recruiter's notes.
//   • No "Verified" wording anywhere (honesty rule).
// Self-contained browser-chrome dashboard mock. Anchored #showcase.
// =============================================================================

export function Showcase() {
  return (
    <section id="showcase" className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a] scroll-mt-14">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            The shortlist you wake up to.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Every applicant ranked by what they&rsquo;ve actually shipped, each with a reason you can act
            on &mdash; and the one whose story doesn&rsquo;t hold up, flagged before you book the call.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          {/* Browser chrome */}
          <div className="px-4 md:px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05] bg-zinc-50/80 dark:bg-[#0d0d10] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden="true" />
            <div className="ml-3 flex-1 max-w-md">
              <div className="px-3 py-1 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate">
                eigenwork.com/dashboard/senior-backend
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Left rail */}
            <aside className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-zinc-100 dark:border-white/[0.05] bg-zinc-50/60 dark:bg-[#101013] p-4 md:p-6">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Senior Backend</h3>
              <p className="text-xs text-zinc-500 mb-6">payments · 62 applicants · 8 worth a screen</p>
              <ul className="hidden md:block space-y-3 text-sm text-zinc-500">
                <RoleRow label="Frontend" count="31 applicants" />
                <RoleRow label="Data Engineer" count="18 applicants" />
                <RoleRow label="Mobile (iOS)" count="9 applicants" />
              </ul>
            </aside>

            {/* Candidate cards */}
            <div className="flex-1 p-4 md:p-6 space-y-3">
              <Candidate
                rank="#1"
                initials="MR"
                name="Maya Rodriguez"
                meta="Senior backend · 6y, fintech"
                reason="Owned a billing ledger at ~2M transactions a day and ended their double-charge incidents — the money-correctness this role runs on."
                probe="Probe: all of it at one company on a mature system; ask how she'd stand one up from scratch."
              />
              <Candidate
                rank="#2"
                initials="AP"
                name="Aditya Patel"
                meta="Backend · 4y, growth-stage SaaS"
                reason="Clean service ownership and solid data modeling; lighter on the high-volume consistency edge cases. A strong interview, not a sure bet."
              />
              <Candidate
                rank="#47"
                initials="VS"
                name="Vikram Singh"
                meta="Backend · claims 5y"
                reason="Reads staff-level on paper — distributed microservices, SQL tuning at scale — but nothing in the actual work backs it up."
                flag="The entire repo was committed in a single day, then never touched. The claims and the code don't match — this one looks staged."
                found={{
                  code: [
                    "Built in one sitting, not over time",
                    "Reads like a finished demo, not a worked problem",
                    "No tests, no error handling for the hard cases",
                  ],
                  resume: [
                    "Claims multi-region microservices at scale",
                    "Claims SQL tuning on large datasets",
                    "None of it appears in the repo",
                  ],
                }}
              />
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-8">Résumé to ranked: under 90 seconds per applicant.</p>
      </div>
    </section>
  );
}

// ---------- Subcomponents ----------------------------------------------------

function RoleRow({ label, count }: { label: string; count: string }) {
  return (
    <li className="flex items-center gap-2">
      <FolderIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      <span className="truncate">
        {label} &middot; {count}
      </span>
    </li>
  );
}

function Candidate({
  rank,
  initials,
  name,
  meta,
  reason,
  probe,
  flag,
  found,
}: {
  rank: string;
  initials: string;
  name: string;
  meta: string;
  reason: string;
  probe?: string;
  flag?: string;
  found?: { code: string[]; resume: string[] };
}) {
  return (
    <article className="rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#15151b] p-5 md:p-6">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 shrink-0" aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{name}</p>
            <p className="text-xs text-zinc-500 truncate">{meta}</p>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {rank}
        </span>
      </header>

      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{reason}</p>

      {probe && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 italic">{probe}</p>}

      {flag && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <FlagIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{flag}</span>
        </div>
      )}

      {found && (
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Findings label="In the code" items={found.code} icon={<CodeIcon className="w-3 h-3" />} />
          <Findings label="On the résumé" items={found.resume} icon={<DocIcon className="w-3 h-3" />} />
        </div>
      )}
    </article>
  );
}

function Findings({ label, items, icon }: { label: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((line) => (
          <li key={line} className="text-sm text-zinc-600 dark:text-zinc-400">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Icons ------------------------------------------------------------

function FolderIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function FlagIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function CodeIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function DocIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
