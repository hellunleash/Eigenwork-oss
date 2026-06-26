"use client";

import Link from "next/link";
import { BILLING_EMAIL } from "@/lib/contact";

export function CtaFooter({ onCta }: { onCta: () => void }) {
  return (
    <>
      {/* ---------- Final CTA band (dark in both light + dark mode) ---------- */}
      <section className="relative py-24 md:py-32 bg-zinc-900 text-white overflow-hidden">
        {/* Dot grid texture overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative max-w-[1000px] mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-medium tracking-[-0.03em] leading-tight text-white">
            Stop reviewing everyone. Start interviewing the right ones.
          </h2>
          <p className="mt-6 text-lg text-zinc-300 max-w-xl mx-auto leading-relaxed">
            Live in 60 seconds. No card. No demo call.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onCta}
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-white text-zinc-900 text-sm font-medium hover:bg-zinc-100 transition-colors"
            >
              Start free
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-white/30 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="bg-white dark:bg-[#0a0a0a] border-t border-zinc-200 dark:border-white/[0.05] py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Top row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
            {/* Brand block */}
            <div className="col-span-2">
              <div className="text-xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                EigenWork
              </div>
            </div>

            {/* Product */}
            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
                Product
              </h3>
              <Link
                href="/pricing"
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                Pricing
              </Link>
              <a
                href="#"
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                Status
              </a>
            </div>

            {/* Company */}
            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
                Company
              </h3>
              <a
                href="#"
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                About
              </a>
              <a
                href={`mailto:${BILLING_EMAIL}`}
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                Contact
              </a>
            </div>

            {/* Legal */}
            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
                Legal
              </h3>
              <Link
                href="/terms"
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
              >
                Privacy
              </Link>
            </div>
          </div>

          {/* Bottom row */}
          <div className="border-t border-zinc-100 dark:border-white/[0.05] pt-8 mt-12 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-xs text-zinc-500">
              © 2026 EigenWork. All rights reserved.
            </div>
            <div className="text-xs text-zinc-500">Made for technical hiring.</div>
          </div>
        </div>
      </footer>
    </>
  );
}
