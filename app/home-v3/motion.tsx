"use client";

// =============================================================================
// /home-v3 — motion utilities.
// The shared primitives (useReducedMotion, useInView, Reveal, useCountUp) are
// REUSED from home-v2/motion — never forked. This file adds only what v3
// introduces: a timed playback sequencer (self-playing Slack thread), a
// pointer tilt, and a post-hydration "armed" flag so entrance animations can
// ship visible-by-default HTML.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useInView, useReducedMotion } from "../home-v2/motion";

export { Reveal, useCountUp, useInView, useReducedMotion } from "../home-v2/motion";

/**
 * Steps through 0..steps once the element scrolls into view, advancing at the
 * given cumulative delays (ms). Reduced motion or missing IO jumps straight to
 * the final step. `step` is how many items are currently visible.
 */
export function usePlayback(delays: number[]) {
  const steps = delays.length;
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });
  const [step, setStep] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (reduced) {
      setStep(steps);
      return;
    }
    const timers = delays.map((t, i) =>
      window.setTimeout(() => setStep(i + 1), t)
    );
    return () => timers.forEach(clearTimeout);
    // delays is authored as a literal; identity changes don't matter after start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced, steps]);

  return { ref, step, done: step >= steps };
}

/** True only after hydration — lets CSS entrances start from visible HTML. */
export function useArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);
  return armed;
}

/**
 * Magnetic wrapper for primary CTAs — the element leans a few pixels toward
 * the pointer and springs back on leave. Transform-only; inert under reduced
 * motion and on coarse pointers.
 */
export function Magnetic({ children, className = "", strength = 0.28 }: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || !ref.current || e.pointerType !== "mouse") return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setStyle({
      transform: `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`,
      transition: "transform 0.12s ease-out",
    });
  };

  const onLeave = () =>
    setStyle({ transform: "translate(0,0)", transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)" });

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`inline-block ${className}`} style={style}>
      {children}
    </div>
  );
}

/**
 * Pointer-tracking tilt for the hero object. Small angles, transform-only,
 * disabled under reduced motion and on coarse pointers.
 */
export function Tilt({ children, className = "", max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [live, setLive] = useState(false);
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const enabled = fine && !reduced;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setLive(true);
    setStyle({
      transform: `perspective(1100px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`,
    });
  };

  const onLeave = () => {
    setLive(false);
    setStyle({});
  };

  return (
    <div
      ref={ref}
      onPointerMove={enabled ? onMove : undefined}
      onPointerLeave={enabled ? onLeave : undefined}
      className={`v3-tilt ${live ? "v3-tilt-live" : ""} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
