"use client";

// =============================================================================
// v3 thread — after the film, the product demos itself: the Slack thread PLAYS
// (Priya asks, the bot answers, action chips land last). Copy byte-identical
// to the live hero thread. Playback starts in view, runs once, settles;
// reduced motion shows the finished thread. Layout shift: none — an invisible
// copy of the finished thread reserves the final height (grid-stack).
// =============================================================================

import type { ReactNode } from "react";
import { Tilt, usePlayback } from "../motion";
import { HashGlyph } from "../icons";

export function Thread() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="relative max-w-[1200px] mx-auto px-6 flex flex-col items-center">
        <div className="relative w-full max-w-[640px]">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-10">
            <div className="v3-aurora-a absolute -right-6 -top-8 h-64 w-64 rounded-full bg-emerald-500/[0.14] blur-3xl" />
            <div className="v3-aurora-b absolute -left-8 bottom-0 h-52 w-52 rounded-full bg-teal-400/[0.08] blur-3xl" />
          </div>
          <Tilt className="relative z-10" max={4}>
            <SlackThread />
          </Tilt>
        </div>
      </div>
    </section>
  );
}

// ---------- Slack thread (self-playing) --------------------------------------

/** Cumulative playback timeline (ms): msg1, bot1, msg2, bot2, chips. */
const TIMELINE = [500, 2100, 3400, 5400, 6100];

function SlackThread() {
  const { ref, step } = usePlayback(TIMELINE);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-white/[0.1] bg-[#121215] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] overflow-hidden text-left"
    >
      {/* Channel header */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center gap-2">
        <HashGlyph className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-200">hiring</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <BotMark className="w-3.5 h-3.5 rounded-[3px] text-[8px]" />
          EigenWork
        </span>
      </div>

      {/* Grid-stack: invisible finished thread reserves height; playback overlays. */}
      <div className="grid">
        <div className="col-start-1 row-start-1 invisible" aria-hidden="true">
          <ThreadBody step={TIMELINE.length} animate={false} />
        </div>
        <div className="col-start-1 row-start-1">
          <ThreadBody step={step} animate />
        </div>
      </div>
    </div>
  );
}

function ThreadBody({ step, animate }: { step: number; animate: boolean }) {
  const cls = animate ? "v3-msg-in" : "";
  return (
    <div className="p-4 md:p-5 space-y-5">
      {step >= 1 && (
        <div className={cls}>
          <Msg name="Priya" avatar="P" avatarClass="bg-amber-500" time="9:41 AM">
            <span className="text-emerald-400">@EigenWork</span> hiring a senior backend engineer,
            payments. Can you take applicants?
          </Msg>
        </div>
      )}

      {step === 1 && animate && <Typing />}

      {step >= 2 && (
        <div className={cls}>
          <Bot time="9:41 AM">
            <p>
              On it. Here&rsquo;s your link to share &rarr;{" "}
              <span className="text-emerald-400">eigenwork.com/apply/sr-backend</span>. Once
              they&rsquo;re in &mdash; want the{" "}
              <strong className="font-semibold text-zinc-100">full ranked list</strong>, or just the{" "}
              <strong className="font-semibold text-zinc-100">best fits</strong> for what matters
              most here?
            </p>
          </Bot>
        </div>
      )}

      {step >= 3 && (
        <div className={cls}>
          <Msg name="Priya" avatar="P" avatarClass="bg-amber-500" time="9:43 AM">
            best fits &mdash; it&rsquo;s payments, so correctness matters most
          </Msg>
        </div>
      )}

      {step === 3 && animate && <Typing />}

      {step >= 4 && (
        <div className={cls}>
          <Bot time="9:43 AM">
            <p>
              Then I&rsquo;m weighting production ownership of money-critical systems. Top pick:{" "}
              <strong className="font-semibold text-zinc-100">Maya Rodriguez</strong> &mdash; owned a
              billing ledger at ~2M transactions/day and drove the fix that killed their
              double-charge incidents. That&rsquo;s the reliability this role lives on.
            </p>
            <p className="mt-2 text-zinc-400">
              One caveat: it&rsquo;s all been at one company on a mature system &mdash; worth probing
              whether she can stand one up from scratch, not just run one.
            </p>
            {step >= 5 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip delay={animate ? 0 : undefined}>Why Maya, not Dev?</Chip>
                <Chip delay={animate ? 120 : undefined}>Show me her résumé</Chip>
                <Chip delay={animate ? 240 : undefined}>Draft an intro</Chip>
              </div>
            )}
          </Bot>
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="v3-msg-in flex items-center gap-3" aria-hidden="true">
      <BotMark className="w-9 h-9 rounded-md text-base" />
      <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white/[0.04]">
        <span className="v3-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
        <span className="v3-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
        <span className="v3-dot w-1.5 h-1.5 rounded-full bg-zinc-400" />
      </span>
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
          <span className="text-sm font-semibold text-zinc-100">{name}</span>
          <span className="text-[11px] text-zinc-500">{time}</span>
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Bot({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <BotMark className="w-9 h-9 rounded-md text-base" />
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-zinc-100">EigenWork</span>
          <span className="inline-flex items-center px-1.5 py-px rounded bg-white/[0.08] text-[9px] font-semibold tracking-wide text-zinc-400 uppercase">
            App
          </span>
          <span className="text-[11px] text-zinc-500">{time}</span>
        </p>
        <div className="text-sm text-zinc-300 leading-relaxed mt-1">{children}</div>
      </div>
    </div>
  );
}

function BotMark({ className = "" }: { className?: string }) {
  return (
    <span className={`shrink-0 inline-flex items-center justify-center bg-emerald-400 text-emerald-950 font-bold leading-none ${className}`} aria-hidden="true">
      E
    </span>
  );
}

function Chip({ children, delay }: { children: ReactNode; delay?: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md border border-white/[0.12] bg-white/[0.03] text-xs font-medium text-zinc-300 ${
        delay != null ? "animate-badge-pop" : ""
      }`}
      style={delay != null ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </span>
  );
}

