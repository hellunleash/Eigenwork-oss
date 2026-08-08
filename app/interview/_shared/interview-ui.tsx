"use client";

// Shared candidate-facing interview chrome (Phase 2). The AEDT consent block + honeypot
// are COMPLIANCE-critical and must stay identical across every round, so they live here
// once (reuse-never-fork). Product-UI tokens: gray + #0a0a0a + emerald accent, subtle
// bordered cards (matches the screen page + the logged-in product surfaces).

import type { ReactNode } from "react";
import { AEDT_NOTICE_TEXT } from "@/lib/interview/consent";

export function InterviewFrame({ phase, title, subtitle, children }: { phase: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        <header className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">{phase}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-50">{title}</h1>
          <p className="mt-2 text-sm text-gray-400">{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}

export function StatusCard({ tone = "neutral", title, body }: { tone?: "neutral" | "error" | "success"; title?: string; body: string }) {
  const box = tone === "success" ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-white/[0.08] bg-white/[0.02]";
  const titleCls = tone === "success" ? "text-emerald-300" : "text-gray-100";
  const bodyCls = tone === "error" ? "text-rose-300" : "text-gray-300";
  return (
    <div className={`rounded-xl border p-6 ${box}`}>
      {title && <h2 className={`text-base font-semibold ${titleCls}`}>{title}</h2>}
      <p className={`text-sm ${title ? "mt-1" : ""} ${bodyCls}`}>{body}</p>
    </div>
  );
}

/** A prompt/assignment/scenario the candidate reads (not editable). */
export function PromptCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="whitespace-pre-wrap text-sm text-gray-200">{children}</div>
    </div>
  );
}

export function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <label className="mb-2 block text-sm text-gray-200">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#0f0f0f] px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500/50 focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <label className="mb-2 block text-sm text-gray-200">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-[#0f0f0f] px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500/50 focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

/** Visually-hidden honeypot — real users never fill it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="absolute left-[-9999px] h-0 w-0 opacity-0"
    />
  );
}

/** AEDT / automated-processing notice + required consent checkbox (LL144 posture). */
export function ConsentBlock({ consented, onChange }: { consented: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-xs leading-relaxed text-gray-400">{AEDT_NOTICE_TEXT}</p>
      <label className="mt-3 flex items-start gap-2.5 text-sm text-gray-200">
        <input type="checkbox" checked={consented} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
        <span>I understand and consent to this automated processing of my submission.</span>
      </label>
    </div>
  );
}

export function SubmitBar({
  statusHint,
  submitting,
  disabled,
  onClick,
  label,
}: {
  statusHint: string;
  submitting: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-xs text-gray-500">{statusHint}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-[#0a0a0a] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Submitting…" : label}
      </button>
    </div>
  );
}
