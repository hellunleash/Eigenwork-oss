"use client";

// =============================================================================
// /home-v3 — the hero film. One pinned viewport, ~2.6 screens of scroll,
// scrubbed by GSAP ScrollTrigger:
//
//   beat A  (p 0.00–0.26)  headline + CTAs over the drifting applicant pile
//   scan    (p 0.10–0.46)  the engine reads — scanline sweeps the field
//   beat B  (p 0.30–0.62)  "Stop reviewing everyone."
//   rank    (p 0.40–0.94)  the pile collapses into the ranked column
//   beat C  (p 0.66–1.00)  "Start interviewing the right ones." + flag chip
//
// Every visible string is reused from the live homepage (the B/C lines are the
// CTA banner headline split in two; HUD labels are the showcase's own sample
// numbers). Reduced motion: no pin, no scrub — a static hero over the finished
// ranked field. No JS: beat A + fallback backdrop (beats B/C stay hidden;
// their copy exists later in the page).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Magnetic } from "../motion";
import { ArrowRight, ChevronDown, FlagIcon, HashGlyph } from "../icons";

const EngineCanvas = dynamic(() => import("./scene").then((m) => m.EngineCanvas), {
  ssr: false,
});

export function HeroFilm({ onCta }: { onCta: () => void }) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const beatA = useRef<HTMLDivElement | null>(null);
  const beatB = useRef<HTMLDivElement | null>(null);
  const beatC = useRef<HTMLDivElement | null>(null);
  const hud62 = useRef<HTMLSpanElement | null>(null);
  const hud8 = useRef<HTMLSpanElement | null>(null);
  const hudFlag = useRef<HTMLSpanElement | null>(null);
  const cue = useRef<HTMLDivElement | null>(null);

  const progress = useRef(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Static hero: finished field, final HUD, no pin.
      setReduced(true);
      progress.current = 1;
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=260%",
          scrub: 0.5,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            progress.current = self.progress;
          },
        },
      });

      tl.to(cue.current, { autoAlpha: 0, duration: 0.05 }, 0.03)
        .to(beatA.current, { autoAlpha: 0, y: -64, filter: "blur(6px)", duration: 0.16 }, 0.10)
        .fromTo(beatB.current, { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.13 }, 0.30)
        .to(beatB.current, { autoAlpha: 0, y: -48, filter: "blur(4px)", duration: 0.11 }, 0.52)
        .fromTo(beatC.current, { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.13 }, 0.66)
        .to(hud62.current, { autoAlpha: 0, duration: 0.05 }, 0.64)
        .fromTo(hud8.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, 0.68)
        .fromTo(hudFlag.current, { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.08 }, 0.84)
        // Keep the timeline's full duration at 1 so positions read as progress.
        .to({}, { duration: 0.001 }, 0.999);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[100svh] overflow-hidden">
      {/* Fallback backdrop (always present, behind the canvas) */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-[-16rem] -translate-x-1/2 h-[30rem] w-[56rem] max-w-[120vw] rounded-full bg-emerald-500/[0.07] blur-3xl" />
      </div>

      {/* The engine field */}
      <div className="absolute inset-0 animate-fade-in" style={{ animationDuration: "1.2s" }}>
        <EngineCanvas progress={progress} reduced={reduced} />
      </div>

      {/* Vignette to keep type readable over the field */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 45%, transparent 45%, rgba(4,4,6,0.75) 100%)",
        }}
      />

      {/* Beat A — the pitch */}
      <div ref={beatA} className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="max-w-[880px] flex flex-col items-center text-center">
          <span
            className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-zinc-950/40 backdrop-blur-sm px-3.5 py-1.5 text-xs font-medium text-zinc-300"
            style={{ animationDelay: "80ms", opacity: 0 }}
          >
            <HashGlyph className="w-3.5 h-3.5 text-emerald-400" />
            Built for technical hiring
          </span>

          <h1
            className="v3-display animate-fade-in-up mt-7 text-[clamp(2.7rem,7vw,5.4rem)] font-semibold leading-[1.02] text-zinc-50 text-balance"
            style={{ animationDelay: "160ms", opacity: 0, textShadow: "0 2px 40px rgba(4,4,6,0.9)" }}
          >
            Hire your next engineer, right from <span className="text-emerald-400">Slack</span>.
          </h1>

          <p
            className="animate-fade-in-up mt-7 max-w-[56ch] text-base md:text-lg text-zinc-300 leading-relaxed text-pretty"
            style={{ animationDelay: "240ms", opacity: 0, textShadow: "0 1px 24px rgba(4,4,6,0.9)" }}
          >
            Post a role, get a ranked shortlist, ask why anyone&rsquo;s on it, and reach out &mdash;
            in your hiring channel, or in the full web app. Same engine behind both: it reads the
            actual work, and flags the ones who don&rsquo;t hold up.
          </p>

          <div
            className="animate-fade-in-up mt-9 flex flex-col sm:flex-row gap-3"
            style={{ animationDelay: "320ms", opacity: 0 }}
          >
            <Magnetic>
              <button
                type="button"
                onClick={onCta}
                className="sheen group inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-emerald-950 bg-emerald-400 rounded-full hover:bg-emerald-300 transition-colors"
              >
                Add to Slack
                <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </Magnetic>
            <Magnetic strength={0.2}>
              <button
                type="button"
                onClick={onCta}
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-zinc-200 border border-white/[0.16] bg-zinc-950/30 backdrop-blur-sm rounded-full hover:border-white/[0.34] transition-colors"
              >
                Start free
              </button>
            </Magnetic>
          </div>

          <p
            className="animate-fade-in-up mt-6 flex items-center gap-2.5 text-[13px] text-zinc-400"
            style={{ animationDelay: "400ms", opacity: 0 }}
          >
            <span className="animate-live-pulse inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Free to start · no card · no new tab to adopt
          </p>
        </div>
      </div>

      {/* Beat B — the problem, mid-scan */}
      <div
        ref={beatB}
        className="v3-beat-hidden absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none"
      >
        <h2 className="v3-display max-w-[16ch] text-center text-[clamp(2.3rem,6vw,4.6rem)] font-semibold leading-[1.04] text-zinc-100 text-balance">
          Stop reviewing <span className="text-zinc-500 line-through decoration-2 decoration-zinc-600">everyone</span>.
        </h2>
      </div>

      {/* Beat C — the payoff, ranked */}
      <div
        ref={beatC}
        className={`${reduced ? "" : "v3-beat-hidden"} absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none`}
      >
        <h2 className="v3-display max-w-[18ch] text-center text-[clamp(2.3rem,6vw,4.6rem)] font-semibold leading-[1.04] text-zinc-50 text-balance">
          Start interviewing the <span className="text-emerald-400">right ones</span>.
        </h2>
      </div>

      {/* HUD — the sample numbers, bottom rail */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6">
        <div className="max-w-[1200px] mx-auto flex items-end justify-between gap-4">
          <span className="relative inline-flex items-center h-7 font-mono text-[12px] text-zinc-400">
            <span ref={hud62} className={`inline-flex items-center gap-2 ${reduced ? "v3-beat-hidden" : ""}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" aria-hidden="true" />
              62 applicants
            </span>
            <span
              ref={hud8}
              className={`absolute left-0 inline-flex items-center gap-2 whitespace-nowrap ${reduced ? "" : "v3-beat-hidden"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="text-emerald-300">8 worth a screen</span>
            </span>
          </span>

          <span
            ref={hudFlag}
            className={`${reduced ? "" : "v3-beat-hidden"} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/25 font-mono text-[11px] text-rose-300`}
          >
            <FlagIcon className="w-3 h-3" />
            flagged before the call
          </span>
        </div>
      </div>

      {/* Scroll cue */}
      <div
        ref={cue}
        className="absolute left-1/2 -translate-x-1/2 bottom-16 z-10 text-zinc-500"
        aria-hidden="true"
      >
        <ChevronDown className="v3-cue w-5 h-5" />
      </div>
    </section>
  );
}
