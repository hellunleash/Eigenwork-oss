// =============================================================================
// Workflow section for /home-v2 preview homepage.
// Replaces the prior "How it works" 3-step-card pattern with a single
// browser-chrome mock containing three stacked product-frame snapshots.
//
// Voice: recruiter / founder / hiring-manager facing. No internal acronyms,
// no engine vocab. Categorical labels only — no numeric scores in primary
// badges. Self-contained: no shared icon library, no animation library.
// =============================================================================

export function Workflow() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      {/* CSS-only pulse for the Extract button — scoped via a class name */}
      <style>{`
        @keyframes pulse-soft {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="max-w-2xl mb-16 r-item">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
            THE WORKFLOW
          </p>
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            Live in 60 seconds. No ATS, no SDR, no demo call.
          </h2>
        </div>

        {/* Browser-chrome mock */}
        <div className="max-w-4xl mx-auto rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          {/* Top chrome bar */}
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="ml-3 px-3 py-1 rounded-md bg-white dark:bg-[#141414] border border-zinc-200 dark:border-white/[0.08] text-xs text-zinc-500">
              eigenwork.com/dashboard
            </div>
          </div>

          {/* Frame 1 — Paste your JD */}
          <Frame number={1} heading="PASTE YOUR JD">
            <div className="border border-zinc-200 dark:border-white/[0.08] rounded-xl p-4 bg-zinc-50/40 dark:bg-white/[0.02] font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
              {`Hiring a Senior Backend Engineer.
Must have 5+ years Python, PostgreSQL,
distributed systems. AWS production
ownership a plus. Remote OK ...`}
            </div>
            <button
              type="button"
              className="animate-pulse-soft mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium"
            >
              Extract
            </button>
            <p className="pl-12 mt-4 text-sm text-zinc-500">
              Paste the JD. We extract the role profile — stack, seniority, must-haves.
            </p>
          </Frame>

          {/* Frame 2 — Share one intake link */}
          <Frame number={2} heading="SHARE ONE INTAKE LINK">
            <div className="flex items-center gap-2 border border-zinc-200 dark:border-white/[0.08] rounded-xl p-3 bg-zinc-50/40 dark:bg-white/[0.02]">
              <LinkIcon className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="flex-1 text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate">
                https://eigenwork.com/apply/senior-backend-87df
              </span>
              <button
                type="button"
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0"
              >
                Copy
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
              <span>Share on:</span>
              <LinkedInIcon className="w-4 h-4 text-zinc-500" />
              <XMarkIcon className="w-4 h-4 text-zinc-500" />
              <GlobeIcon className="w-4 h-4 text-zinc-500" />
            </div>
            <p className="pl-12 mt-4 text-sm text-zinc-500">
              Drop it in LinkedIn or your careers page. Candidates upload résumé + GitHub
              themselves. 60-second submission.
            </p>
          </Frame>

          {/* Frame 3 — Wake up to your shortlist */}
          <Frame number={3} heading="WAKE UP TO YOUR SHORTLIST">
            <div>
              <ShortlistRow
                dotClass="bg-emerald-500"
                name="Maya Rodriguez"
                badgeText="Strong fit"
                badgeClass="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                role="Senior backend · 5y FAANG"
                rank="#1"
              />
              <ShortlistRow
                dotClass="bg-amber-500"
                name="Aditya Patel"
                badgeText="Worth a screen"
                badgeClass="bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                role="Frontend · React, TS"
                rank="#2"
              />
              <ShortlistRow
                dotClass="bg-red-500"
                name="Vikram Singh"
                badgeText="Risk · Looks staged"
                badgeClass="bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
                role="Backend · Python, Django"
                rank="#47"
              />
            </div>
            <p className="pl-12 mt-4 text-sm text-zinc-500">
              Open the ones worth your hour. Skip the rest.
            </p>
          </Frame>
        </div>
      </div>
    </section>
  );
}

// ---------- Frame wrapper ----------------------------------------------------

function Frame({
  number,
  heading,
  children,
}: {
  number: number;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-8 border-b border-zinc-100 dark:border-white/[0.06] last:border-b-0 relative r-item"
      style={{ transitionDelay: `${0.08 + (number - 1) * 0.08}s` }}
    >
      <span className="absolute top-6 left-6 inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-medium">
        {number}
      </span>
      <h3 className="pl-12 text-sm font-mono uppercase tracking-wider text-zinc-500 mb-4">
        {heading}
      </h3>
      {children}
    </div>
  );
}

// ---------- Shortlist row ----------------------------------------------------

function ShortlistRow({
  dotClass,
  name,
  badgeText,
  badgeClass,
  role,
  rank,
}: {
  dotClass: string;
  name: string;
  badgeText: string;
  badgeClass: string;
  role: string;
  rank: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] last:border-b-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</span>
      <span className={`text-xs px-2 py-0.5 rounded-md ${badgeClass}`}>{badgeText}</span>
      <span className="text-sm text-zinc-500 ml-auto truncate">{role}</span>
      <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 shrink-0">
        {rank}
      </span>
    </div>
  );
}

// ---------- Inline icons -----------------------------------------------------

function LinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}

function LinkedInIcon({ className = "w-4 h-4" }: { className?: string }) {
  // Stylized "in" mark
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.5 0h4.37v1.92h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.48 3.04 5.48 7v7.44h-4.56v-6.6c0-1.57-.03-3.6-2.2-3.6-2.2 0-2.54 1.72-2.54 3.49V22H7.72V8z" />
    </svg>
  );
}

function XMarkIcon({ className = "w-4 h-4" }: { className?: string }) {
  // X (formerly Twitter) slash mark
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function GlobeIcon({ className = "w-4 h-4" }: { className?: string }) {
  // Globe (careers page)
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18"
      />
    </svg>
  );
}
