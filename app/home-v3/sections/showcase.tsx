"use client";

// =============================================================================
// v3 showcase — the payoff object, staged like the engine works: the scanline
// reads the list, ranks land one by one, and the one staged profile gets its
// flag last. Copy identical to the live showcase (one flagged candidate,
// recruiter-voiced reasons, no "verified" wording). Résumé claims the work
// doesn't back are struck through — the brand gesture.
// Classes that hide content are only applied once playback starts (JS + in
// view), so the static/no-JS render is the finished dashboard.
// =============================================================================

import type { ReactNode } from "react";
import { useInView } from "../motion";
import { CodeIcon, DocIcon, FlagIcon, FolderIcon } from "../icons";

export function Showcase() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });

  return (
    <section id="showcase" className="py-24 md:py-32 scroll-mt-14">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <h2 className="v3-display text-3xl md:text-5xl font-semibold leading-[1.05] text-zinc-50 text-balance">
            The shortlist you wake up to.
          </h2>
          <p className="mt-6 text-base md:text-lg text-zinc-400 leading-relaxed text-pretty">
            Every applicant ranked by what they&rsquo;ve actually shipped, each with a reason you can
            act on &mdash; and the one whose story doesn&rsquo;t hold up, flagged before you book the
            call.
          </p>
        </div>

        <div
          ref={ref}
          className="rounded-2xl border border-white/[0.09] bg-[#101013] shadow-[0_32px_90px_-32px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Browser chrome */}
          <div className="px-4 md:px-5 py-3 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <div className="ml-3 flex-1 max-w-md">
              <div className="px-3 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-500 font-mono truncate">
                eigenwork.com/dashboard/senior-backend
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Left rail */}
            <aside className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.05] bg-white/[0.015] p-4 md:p-6">
              <h3 className="text-base font-semibold text-zinc-100">Senior Backend</h3>
              <p className="text-xs text-zinc-500 mb-6">payments · 62 applicants · 8 worth a screen</p>
              <ul className="hidden md:block space-y-3 text-sm text-zinc-500">
                <RoleRow label="Frontend" count="31 applicants" />
                <RoleRow label="Data Engineer" count="18 applicants" />
                <RoleRow label="Mobile (iOS)" count="9 applicants" />
              </ul>
            </aside>

            {/* Candidate list + scanline */}
            <div className="relative flex-1 p-4 md:p-6 space-y-3 overflow-hidden">
              {inView && (
                <div
                  aria-hidden="true"
                  className="v3-scan absolute inset-x-2 h-px z-10 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(52,211,153,0.7) 30%, rgba(52,211,153,0.7) 70%, transparent)",
                    boxShadow: "0 0 24px 2px rgba(52,211,153,0.35)",
                  }}
                />
              )}

              <Staged play={inView} delay={350}>
                <Candidate
                  rank="#1"
                  top
                  initials="MR"
                  name="Maya Rodriguez"
                  meta="Senior backend · 6y, fintech"
                  reason="Owned a billing ledger at ~2M transactions a day and ended their double-charge incidents — the money-correctness this role runs on."
                  probe="Probe: all of it at one company on a mature system; ask how she'd stand one up from scratch."
                />
              </Staged>
              <Staged play={inView} delay={650}>
                <Candidate
                  rank="#2"
                  initials="AP"
                  name="Aditya Patel"
                  meta="Backend · 4y, growth-stage SaaS"
                  reason="Clean service ownership and solid data modeling; lighter on the high-volume consistency edge cases. A strong interview, not a sure bet."
                />
              </Staged>
              <Staged play={inView} delay={950}>
                <Candidate
                  rank="#47"
                  initials="VS"
                  name="Vikram Singh"
                  meta="Backend · claims 5y"
                  reason="Reads staff-level on paper — distributed microservices, SQL tuning at scale — but nothing in the actual work backs it up."
                  flag="The entire repo was committed in a single day, then never touched. The claims and the code don't match — this one looks staged."
                  flagDelay={play(inView, 1900)}
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
              </Staged>
            </div>
          </div>
        </div>

        <p className="text-center text-[13px] font-mono text-zinc-500 mt-8">
          Résumé to ranked: under 90 seconds per applicant.
        </p>
      </div>
    </section>
  );
}

// ---------- Staging helpers ---------------------------------------------------

function play(inView: boolean, delay: number): number | undefined {
  return inView ? delay : undefined;
}

/** Applies the entrance class + delay only once playback starts. */
function Staged({ play, delay, children }: { play: boolean; delay: number; children: ReactNode }) {
  return (
    <div className={play ? "v3-msg-in" : ""} style={play ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

// ---------- Subcomponents ----------------------------------------------------

function RoleRow({ label, count }: { label: string; count: string }) {
  return (
    <li className="flex items-center gap-2">
      <FolderIcon className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
      <span className="truncate">
        {label} &middot; {count}
      </span>
    </li>
  );
}

function Candidate({
  rank,
  top = false,
  initials,
  name,
  meta,
  reason,
  probe,
  flag,
  flagDelay,
  found,
}: {
  rank: string;
  top?: boolean;
  initials: string;
  name: string;
  meta: string;
  reason: string;
  probe?: string;
  flag?: string;
  flagDelay?: number;
  found?: { code: string[]; resume: string[] };
}) {
  return (
    <article
      className={`rounded-xl border p-5 md:p-6 ${
        top ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-zinc-100 truncate">{name}</p>
            <p className="text-xs text-zinc-500 truncate">{meta}</p>
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-md font-mono text-sm font-semibold tabular-nums ${
            top ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-zinc-300"
          }`}
        >
          {rank}
        </span>
      </header>

      <p className="text-sm text-zinc-300 leading-relaxed">{reason}</p>

      {probe && <p className="mt-2 text-xs text-zinc-500 italic">{probe}</p>}

      {flag && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-sm text-rose-300 flex items-start gap-2 ${
            flagDelay != null ? "v3-msg-in" : ""
          }`}
          style={flagDelay != null ? { animationDelay: `${flagDelay}ms` } : undefined}
        >
          <FlagIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{flag}</span>
        </div>
      )}

      {found && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Findings label="In the code" items={found.code} icon={<CodeIcon className="w-3 h-3" />} />
          <Findings
            label="On the résumé"
            items={found.resume}
            icon={<DocIcon className="w-3 h-3" />}
            strikeClaims
          />
        </div>
      )}
    </article>
  );
}

function Findings({
  label,
  items,
  icon,
  strikeClaims = false,
}: {
  label: string;
  items: string[];
  icon: ReactNode;
  strikeClaims?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <ul className="space-y-2">
        {items.map((line) => {
          const struck = strikeClaims && line.startsWith("Claims");
          return (
            <li
              key={line}
              className={
                struck
                  ? "text-sm text-zinc-500 line-through decoration-rose-400/60 decoration-[1.5px]"
                  : "text-sm text-zinc-400"
              }
            >
              {line}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
