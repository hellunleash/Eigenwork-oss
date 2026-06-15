"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "Customers", href: "#" },
  { label: "Changelog", href: "#" },
];

export function Nav({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prevent background scroll when the mobile sheet is open.
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
      <nav
        className={`sticky top-0 z-40 bg-white dark:bg-[#0a0a0a] border-b transition-colors ${
          scrolled
            ? "border-zinc-200 dark:border-white/[0.08]"
            : "border-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            EigenWork
          </Link>

          <div className="hidden md:flex gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignIn}
              className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Try free
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Open menu"
              aria-expanded={sheetOpen}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 ml-1 -mr-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </nav>

      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 bg-white dark:bg-[#0a0a0a] z-50 p-6 md:hidden flex flex-col"
        >
          <div className="flex items-center justify-between">
            <Link
              href="/"
              onClick={closeSheet}
              className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100"
            >
              EigenWork
            </Link>
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Close menu"
              className="inline-flex items-center justify-center w-10 h-10 -mr-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-12 flex flex-col gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={closeSheet}
                className="text-base font-medium text-zinc-900 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            <button
              type="button"
              onClick={handleSignInClick}
              className="w-full px-5 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-white/[0.08] rounded-full hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignInClick}
              className="w-full px-5 py-3 text-sm font-medium text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Try free
            </button>
          </div>
        </div>
      )}
    </>
  );
}
