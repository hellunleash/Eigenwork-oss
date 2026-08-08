"use client";

// =============================================================================
// v3 nav — fixed; on scroll it condenses into a floating, hairline-bordered
// bar with functional backdrop blur (readability over content, not decor).
// Links + copy identical to the live nav.
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloseIcon, MenuIcon } from "../icons";

const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Why EigenWork", href: "#why" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "/pricing" },
];

export function Nav({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const closeSheet = () => setSheetOpen(false);
  const handleSignInClick = () => {
    closeSheet();
    onSignIn();
  };

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 pointer-events-none">
        <div
          className={`pointer-events-auto mx-auto flex items-center justify-between px-4 sm:px-5 transition-all duration-500 ease-out ${
            scrolled
              ? "mt-3 max-w-[880px] h-12 rounded-2xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)]"
              : "mt-0 max-w-[1200px] h-16 rounded-none border border-transparent bg-transparent"
          }`}
        >
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-100">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-[6px] bg-emerald-400 text-emerald-950 text-[13px] font-bold leading-none">
              E
            </span>
            EigenWork
          </Link>

          <nav className="hidden md:flex items-center gap-7" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-[13.5px] text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSignIn}
              className="hidden sm:inline-flex px-3 py-1.5 text-[13.5px] font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="sheen inline-flex items-center px-4 py-1.5 text-[13.5px] font-semibold text-emerald-950 bg-emerald-400 rounded-full hover:bg-emerald-300 transition-colors"
            >
              Try free
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Open menu"
              aria-expanded={sheetOpen}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 -mr-2 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 bg-zinc-950 z-50 p-6 md:hidden flex flex-col"
        >
          <div className="flex items-center justify-between">
            <Link href="/" onClick={closeSheet} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-100">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-[6px] bg-emerald-400 text-emerald-950 text-[13px] font-bold leading-none">
                E
              </span>
              EigenWork
            </Link>
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Close menu"
              className="inline-flex items-center justify-center w-10 h-10 -mr-2 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          <nav className="mt-14 flex flex-col gap-7" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={closeSheet}
                className="v3-display text-2xl font-medium text-zinc-100 hover:text-emerald-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            <button
              type="button"
              onClick={handleSignInClick}
              className="w-full px-5 py-3 text-sm font-medium text-zinc-100 border border-white/[0.12] rounded-full hover:bg-white/[0.04] transition-colors"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignInClick}
              className="w-full px-5 py-3 text-sm font-semibold text-emerald-950 bg-emerald-400 rounded-full hover:bg-emerald-300 transition-colors"
            >
              Try free
            </button>
          </div>
        </div>
      )}
    </>
  );
}
