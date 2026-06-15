"use client";

// =============================================================================
// Hero section for /home-v2.
// Audience: recruiters, founders, hiring managers. Engineer-speak is off-limits.
// Self-contained except for the shared motion primitives. Icons are inline SVG.
// Dark mode is class-based via the parent <html>.
//
// Motion: the headline rises on load; the shortlist mock RANKS LIVE on view —
// a scan sweep resolves each candidate, badges pop in, and the staged profile
// drops to #47. Cursor spotlight + drifting emerald glow give the card life.
// All of it collapses to a clean static state under prefers-reduced-motion.
// =============================================================================

import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useReducedMotion, useInView } from "../motion";

export function Hero({ onCta }: { onCta: () => void }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Staggered load-in for the left column. Reduced motion → no inline transform.
  const rise = (i: number): CSSProperties =>
    reduced
      ? {}
      : {
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(18px)",
          transition:
            "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)",
          transitionDelay: `${i * 80}ms`,
        };

  // Headline lines clip up from below.
  const line = (i: number): CSSProperties =>
    reduced
      ? { display: "block" }
      : {
          display: "block",
          transform: shown ? "translateY(0)" : "translateY(110%)",
          transition: "transform .9s cubic-bezier(.22,1,.36,1)",
          transitionDelay: `${i * 90}ms`,
        };

  return (
    <section className="relative pt-20 pb-24 md:pt-28 md:pb-36 overflow-hidden">
      <DotGridBackground />
      <div className="relative max-w-[1200px] mx-auto px-6 grid md:grid-cols-12 gap-12 items-center">
        {/* Left column: copy + CTAs */}
        <div className="md:col-span-7">
          <p
            style={rise(0)}
            className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-6"
          >
            For technical hiring teams
          </p>

          <h1 className="text-5xl md:text-7xl font-medium tracking-[-0.04em] leading-[0.95] text-zinc-900 dark:text-zinc-100 mb-6">
            <span className="block overflow-hidden">
              <span style={line(0)} className="pb-[0.12em]">
                Know who can{" "}
                <span className="text-emerald-600 dark:text-emerald-400">do the job</span>,
              </span>
            </span>
            <span className="block overflow-hidden">
              <span style={line(1)} className="pb-[0.12em]">
                before you interview.
              </span>
            </span>
          </h1>

          <p
            style={rise(2)}
            className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-[56ch] mb-9"
          >
            EigenWork ranks every applicant on what actually proves they can do it &mdash;
            working code for early-career engineers, real work history for experienced ones
            &mdash; and flags the inflated profiles before they reach your calendar.
          </p>

          <div style={rise(3)} className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCta}
              className="sheen group inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Start free
              <ArrowRightIcon className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
            <a
              href="#showcase"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-transparent border border-zinc-300 dark:border-white/[0.15] rounded-full hover:border-zinc-400 dark:hover:border-white/[0.3] transition-colors"
            >
              See a sample shortlist
            </a>
          </div>

          <div
            style={rise(4)}
            className="mt-6 flex items-center gap-2 text-sm text-zinc-500"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>60-second setup · no card · no demo call</span>
          </div>
        </div>

        {/* Right column: live-ranking shortlist mock */}
        <div style={rise(2)} className="md:col-span-5 relative">
          {/* Drifting brand-accent glow (replaces the old purple mesh) */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-6 top-2 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl animate-aurora" />
            <div
              className="absolute left-0 bottom-4 h-40 w-40 rounded-full bg-teal-300/15 blur-3xl animate-aurora"
              style={{ animationDelay: "-7s" }}
            />
          </div>
          <div className="relative z-10">
            <ShortlistMock />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Background --------------------------------------------------------

function DotGridBackground() {
  // Two stacked layers: a light-mode grid that disappears in dark, and a
  // dark-mode grid that disappears in light. Pure CSS — no radial wash.
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none dark:hidden"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, #e5e5e5 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none hidden dark:block"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </>
  );
}

// ---------- Ranked shortlist mock (live) -------------------------------------

function ShortlistMock() {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>();
  const [revealed, setRevealed] = useState(0); // how many candidates are scored
  const [settled, setSettled] = useState(false); // ranking finalized

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setRevealed(3);
      setSettled(true);
      return;
    }
    const timers = [
      window.setTimeout(() => setRevealed(1), 700),
      window.setTimeout(() => setRevealed(2), 1150),
      window.setTimeout(() => setRevealed(3), 1600),
      window.setTimeout(() => setSettled(true), 2150),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, [inView, reduced]);

  const scanning = inView && !settled && !reduced;

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className="hover-lift group relative rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-sm overflow-hidden"
    >
      {/* Cursor spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(16,185,129,0.10), transparent 65%)",
        }}
      />

      {/* Browser-chrome top + live status */}
      <div className="relative px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
        <span className="ml-2 flex items-center gap-2 text-xs text-zinc-500">
          {settled ? (
            <>
              <span
                className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-live-pulse"
                aria-hidden="true"
              />
              Top 5 ready · 47 applicants
            </>
          ) : scanning ? (
            <>
              <Spinner /> Ranking 47 applicants&hellip;
            </>
          ) : (
            "Senior Backend · 47 applicants"
          )}
        </span>
      </div>

      {/* Scan progress bar */}
      <div className="h-0.5 w-full overflow-hidden">
        {scanning && (
          <div className="h-full w-1/4 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-shimmer" />
        )}
      </div>

      <div className="relative p-5 space-y-3">
        {/* Scan line */}
        {scanning && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-3 right-3 top-0 h-20 bg-gradient-to-b from-transparent via-emerald-400/15 to-transparent animate-scan"
          />
        )}

        {/* #1 — expanded */}
        <TopCandidateExpanded show={revealed >= 1} settled={settled} />

        {/* #2 — collapsed */}
        <CollapsedCandidate
          show={revealed >= 2}
          initials="AP"
          avatarClass="bg-amber-500"
          name="Aditya Patel"
          email="aditya.p@gmail.com"
          rank="#2"
          badgeText="Worth a screen"
          badgeClass="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          role="Frontend · React, TypeScript"
        />

        {/* Staged profile — drops to #47 once ranking settles */}
        <CollapsedCandidate
          show={revealed >= 3}
          initials="VS"
          avatarClass="bg-red-500"
          name="Vikram Singh"
          email="vikram.s@gmail.com"
          rank={settled ? "#47" : "#3"}
          badgeText="Risk · Looks staged"
          badgeClass="bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          role="Backend · Python, Django"
        />

        {/* Footer row */}
        <div className="flex items-center justify-between pt-2 px-2">
          <div className="flex -space-x-2">
            <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 border-2 border-white dark:border-[#141414]" aria-hidden="true" />
            <span className="w-6 h-6 rounded-full bg-zinc-300 dark:bg-zinc-600 border-2 border-white dark:border-[#141414]" aria-hidden="true" />
            <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 border-2 border-white dark:border-[#141414]" aria-hidden="true" />
          </div>
          <p className="text-xs text-zinc-500">+44 more, ranked</p>
        </div>
      </div>
    </div>
  );
}

function TopCandidateExpanded({ show, settled }: { show: boolean; settled: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-500 ${
        show ? "opacity-100" : "opacity-50"
      } ${
        settled
          ? "border-emerald-300/70 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/[0.04] shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
          : "border-zinc-100 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-semibold text-white">
            MR
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              Maya Rodriguez
            </p>
            <p className="text-[11px] text-zinc-500 truncate">maya.r@gmail.com</p>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0">
          #1
        </span>
      </div>

      {/* Badge slot — fixed height keeps the layout still while it resolves */}
      <div className="mt-2 h-[26px]">
        {show ? (
          <span className="animate-badge-pop inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
            <CheckIcon className="w-3 h-3" />
            Strong fit · Verified senior
          </span>
        ) : (
          <span className="block h-[22px] w-48 rounded-md bg-zinc-200/70 dark:bg-white/[0.06] animate-pulse" />
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {show ? (
          <>
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Senior backend engineer · 5y FAANG
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Owned billing at scale &mdash; 99.99% uptime; led 3-team monolith &rarr;
              event-driven migration.
            </p>
          </>
        ) : (
          <>
            <span className="block h-3 w-44 rounded bg-zinc-200/70 dark:bg-white/[0.06] animate-pulse" />
            <span className="block h-3 w-full rounded bg-zinc-200/70 dark:bg-white/[0.06] animate-pulse" />
          </>
        )}
      </div>
    </div>
  );
}

function CollapsedCandidate({
  show,
  initials,
  avatarClass,
  name,
  email,
  rank,
  badgeText,
  badgeClass,
  role,
}: {
  show: boolean;
  initials: string;
  avatarClass: string;
  name: string;
  email: string;
  rank: string;
  badgeText: string;
  badgeClass: string;
  role: string;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02] p-4 transition-opacity duration-500 ${
        show ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white ${avatarClass}`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {name}
            </p>
            {/* key=rank → re-pops when the rank changes (e.g. #3 → #47) */}
            <span
              key={rank}
              className="animate-badge-pop inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0"
            >
              {rank}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 truncate">{email}</p>
        </div>
        <div className="hidden sm:block w-[116px] text-right">
          {show ? (
            <span
              className={`animate-badge-pop inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${badgeClass}`}
            >
              {badgeText}
            </span>
          ) : (
            <span className="inline-block h-[26px] w-24 rounded-md bg-zinc-200/70 dark:bg-white/[0.06] animate-pulse align-middle" />
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
        {show && (
          <span
            className={`sm:hidden inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium mr-2 ${badgeClass}`}
          >
            {badgeText}
          </span>
        )}
        {role}
      </p>
    </div>
  );
}

// ---------- Icons -------------------------------------------------------------

function ArrowRightIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function CheckIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border-[1.5px] border-zinc-300 dark:border-zinc-600 border-t-emerald-500 dark:border-t-emerald-400 animate-spin"
      aria-hidden="true"
    />
  );
}
