"use client";

// =============================================================================
// v3 final CTA + footer. The CTA is the second (and last) emerald drench —
// bookending the Why section — with the same copy as live. Footer links
// unchanged.
// =============================================================================

import Link from "next/link";
import { BILLING_EMAIL } from "@/lib/contact";

export function CtaFooter({ onCta }: { onCta: () => void }) {
  return (
    <>
      {/* ---------- Final CTA band ---------- */}
      <section
        className="relative py-28 md:py-36 overflow-hidden"
        style={{ backgroundColor: "var(--v3-drench-deep)" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(209,250,229,0.07) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="v3-aurora-a absolute left-1/2 top-[-10rem] -translate-x-1/2 h-[20rem] w-[40rem] max-w-[100vw] rounded-full bg-emerald-400/[0.1] blur-3xl pointer-events-none"
        />

        <div className="relative max-w-[1000px] mx-auto px-6 text-center">
          <h2 className="v3-display text-4xl md:text-6xl font-semibold leading-[1.04] text-emerald-50 text-balance">
            Stop reviewing everyone. Start interviewing the right ones.
          </h2>
          <p className="mt-6 text-lg text-emerald-100/85 max-w-xl mx-auto leading-relaxed">
            Live in 60 seconds. No card. No demo call.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={onCta}
              className="sheen inline-flex items-center justify-center px-7 py-3 rounded-full bg-emerald-50 text-emerald-950 text-sm font-semibold hover:bg-white transition-colors"
            >
              Start free
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-7 py-3 rounded-full border border-emerald-100/30 text-emerald-50 text-sm font-medium hover:bg-emerald-100/[0.08] hover:border-emerald-100/50 transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-white/[0.05] py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
            <div className="col-span-2">
              <div className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-100">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-[6px] bg-emerald-400 text-emerald-950 text-[13px] font-bold leading-none">
                  E
                </span>
                EigenWork
              </div>
            </div>

            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">Product</h3>
              <Link href="/pricing" className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors">
                Pricing
              </Link>
              <a href="#" className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors">
                Status
              </a>
            </div>

            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">Company</h3>
              <a href="#" className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors">
                About
              </a>
              <a
                href={`mailto:${BILLING_EMAIL}`}
                className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors"
              >
                Contact
              </a>
            </div>

            <div className="col-span-1">
              <h3 className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">Legal</h3>
              <Link href="/terms" className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="block text-sm text-zinc-400 hover:text-zinc-100 mb-2 transition-colors">
                Privacy
              </Link>
            </div>
          </div>

          <div className="border-t border-white/[0.05] pt-8 mt-12 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-xs text-zinc-500">© 2026 EigenWork. All rights reserved.</div>
            <div className="text-xs text-zinc-500">Made for technical hiring.</div>
          </div>
        </div>
      </footer>
    </>
  );
}
