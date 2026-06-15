// =============================================================================
// home-v2 · Candidate Showcase section
//
// Marketing centerpiece. Renders a full dashboard mock — left rail with role
// list, right pane with four candidate cards — to show recruiters exactly what
// they get on day one. One card is pre-expanded with a plain-English "what we
// found" panel split across code-side and resume-side observations.
//
// Voice contract: NO internal engine vocabulary anywhere in the user-visible
// copy. NO numeric scores in primary badges. Categorical labels only.
//
// Self-contained. No sibling imports.
// =============================================================================

export function Showcase() {
  return (
    <section
      id="showcase"
      className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]"
    >
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Section header */}
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500">
            What lands in your dashboard
          </p>
          <h2 className="mt-3 text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] text-zinc-900 dark:text-zinc-100">
            Your shortlist. Risk flagged. Evidence one click away.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Every applicant ranked by what they&rsquo;ve actually shipped. Risk surfaced before
            you book interviews. The full evidence trail one tap away &mdash; for when the
            hiring manager pushes back.
          </p>
        </div>

        {/* Dashboard shell mock */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          {/* Browser chrome */}
          <div className="px-4 md:px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05] bg-zinc-50/80 dark:bg-[#0d0d10] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
            <div className="ml-3 flex-1 max-w-md">
              <div className="px-3 py-1 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate">
                eigenwork.com/dashboard/senior-backend
              </div>
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex flex-col md:flex-row">
            {/* Left rail */}
            <aside className="w-full md:w-64 shrink-0 border-r-0 md:border-r border-b md:border-b-0 border-zinc-100 dark:border-white/[0.05] bg-zinc-50/60 dark:bg-[#101013] p-4 md:p-6">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Senior Backend
              </h3>
              <p className="text-xs text-zinc-500 mb-6">
                47 applicants &middot; 12 worth a screen
              </p>
              <ul className="hidden md:block space-y-3 text-sm text-zinc-500">
                <RoleRow label="Senior Frontend" count="8 applicants" />
                <RoleRow label="Mobile (iOS)" count="22 applicants" />
                <RoleRow label="DevOps Lead" count="12 applicants" />
                <RoleRow label="Data Engineer" count="5 applicants" />
              </ul>
            </aside>

            {/* Right pane: candidate cards */}
            <div className="flex-1 p-4 md:p-6 space-y-4">
              <CandidateCard
                initials="MR"
                avatarTone="emerald"
                name="Maya Rodriguez"
                email="maya.r@gmail.com"
                rank="#1"
                badge={{ tone: "emerald", text: "Strong fit · Verified senior" }}
                role="Senior backend engineer · 5y FAANG"
                why="Owned billing at scale — 99.99% uptime; led 3-team monolith → event-driven migration with measurable on-call burden cut."
              />

              <CandidateCard
                initials="AP"
                avatarTone="amber"
                name="Aditya Patel"
                email="aditya.p@gmail.com"
                rank="#2"
                badge={{ tone: "amber", text: "Worth a screen" }}
                role="Frontend engineer · React, TypeScript"
                why="Clean React + TypeScript with custom hooks, tested API layer end-to-end, CI workflows present in the repo."
                watchFor="Only 38% of his commits are his — repo may not be solo work."
              />

              <CandidateCard
                initials="AB"
                avatarTone="amber"
                name="abhay2"
                email="demo.candidate@example.com"
                rank="#3"
                badge={{ tone: "amber", text: "Worth a screen" }}
                role="Mobile engineer · hardened patterns, slim scope"
                why="Defensive code with try/catches and validation throughout; names AES-256, FFI on résumé."
                watchFor="No production signal — scope stays exercise-size."
                expanded
                findings={{
                  code: [
                    "207 files (15 are actual code)",
                    "Folder depth: 8 levels",
                    "Careful error handling throughout",
                    "3 commits over 36 days",
                    "Solo author, 100%",
                    "No CI, no Docker",
                  ],
                  resume: [
                    "Names AES-256, FFI",
                    "Claims 5 ms latency",
                    "Scope: plausible",
                    "0 years verified",
                    "No named employers",
                  ],
                }}
              />

              <CandidateCard
                initials="VS"
                avatarTone="red"
                name="Vikram Singh"
                email="vikram.s@gmail.com"
                rank="#47"
                badge={{ tone: "red", text: "Risk — looks staged" }}
                role="Backend engineer · Python, Django"
                why="Résumé narrates microservices and SQL tuning at scale; the repo's depth and commit pattern don't match the claims."
                watchFor="Whole repo committed in one day — looks staged."
              />
            </div>
          </div>
        </div>

        {/* Footer line */}
        <p className="text-center text-sm text-zinc-500 mt-8">
          Upload to ranked: under 90 seconds per applicant.
        </p>
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

type Tone = "emerald" | "amber" | "red";

function CandidateCard({
  initials,
  avatarTone,
  name,
  email,
  rank,
  badge,
  role,
  why,
  watchFor,
  expanded,
  findings,
}: {
  initials: string;
  avatarTone: Tone;
  name: string;
  email: string;
  rank: string;
  badge: { tone: Tone; text: string };
  role: string;
  why: string;
  watchFor?: string;
  expanded?: boolean;
  findings?: { code: string[]; resume: string[] };
}) {
  const avatarClass = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  }[avatarTone];

  const badgeClass = {
    emerald:
      "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20",
    amber:
      "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20",
    red:
      "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20",
  }[badge.tone];

  return (
    <article className="rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-white dark:bg-[#15151b] p-5 md:p-6">
      {/* Header row */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarClass}`}
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {name}
            </p>
            <p className="text-xs text-zinc-500 truncate">{email}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}
          >
            {badge.text}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {rank}
          </span>
        </div>
      </header>

      {/* Role one-liner */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
        {role}
      </p>

      {/* Why they stand out */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
        {why}
      </p>

      {/* Watch-for red callout */}
      {watchFor && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-300 mb-3 flex items-start gap-2">
          <FlagIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{watchFor}</span>
        </div>
      )}

      {/* What we found button (+ expanded panel) */}
      {expanded && findings ? (
        <>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
            aria-expanded="true"
          >
            What we found
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                <CodeIcon className="w-3 h-3" />
                In the code
              </p>
              <ul className="space-y-2">
                {findings.code.map((line) => (
                  <li
                    key={line}
                    className="text-sm text-zinc-600 dark:text-zinc-400"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                <DocIcon className="w-3 h-3" />
                On the résumé
              </p>
              <ul className="space-y-2">
                {findings.resume.map((line) => (
                  <li
                    key={line}
                    className="text-sm text-zinc-600 dark:text-zinc-400"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
          aria-expanded="false"
        >
          What we found
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </article>
  );
}

// ---------- Inline icons -----------------------------------------------------

function FolderIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

function FlagIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9"
      />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function ChevronDownIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function CodeIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  );
}

function DocIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
