"use client";

// =============================================================================
// /home-v2 — shared motion primitives.
// Restrained, premium motion: scroll-reveal, count-up, in-view detection,
// reduced-motion awareness. No animation library — IntersectionObserver +
// requestAnimationFrame only. Everything degrades to a static final state
// under `prefers-reduced-motion: reduce`.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/** True when the user has asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Fires once when the element scrolls into view; stays true afterwards. */
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px", ...options }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

/** Block wrapper that rises + un-blurs once it scrolls into view. */
export function Reveal({
  children,
  className = "",
  delay = 0,
  stagger = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** When true, the wrapper is only the in-view trigger; marked `.r-item`
   *  descendants cascade in (per-item delay set via inline transition-delay). */
  stagger?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  if (stagger) {
    return (
      <div
        ref={ref}
        className={`reveal-group ${inView ? "is-in" : ""} ${className}`.trim()}
      >
        {children}
      </div>
    );
  }
  const style: CSSProperties = delay ? { transitionDelay: `${delay}ms` } : {};
  return (
    <div
      ref={ref}
      style={style}
      className={`reveal ${inView ? "reveal-in" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Eased count from 0 → target. Holds 0 until `start` is true. */
export function useCountUp(
  target: number,
  opts?: { duration?: number; start?: boolean }
): number {
  const duration = opts?.duration ?? 1400;
  const start = opts?.start ?? true;
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start, reduced]);
  return val;
}
