// =============================================================================
// DRAFT /home-v2 — FAQ only.
// The MOCK testimonials block (3 invented quotes: Sarah Chen / Marcus Tate /
// Priya Iyer) was REMOVED — fake social proof, and the founder wants it gone
// until real customer quotes exist. The FAQ stays: real, recruiter-voiced.
//
// Honesty fix: the senior-track answer used to say "verified work history".
// EigenWork does NOT verify employment — it reads + cross-checks claims. Reworded.
//
// Export name kept as `TestimonialsFaq` so promotion is a clean file-swap (the
// landing composition needs no import change).
// =============================================================================

export function TestimonialsFaq() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        <FaqBlock />
      </div>
    </section>
  );
}

// ---------- FAQ --------------------------------------------------------------

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Do I have to log into a dashboard?",
    a: "Up to you. The whole loop — posting a role, the ranked shortlist, asking why, drafting outreach — works in Slack if that’s where you live. Prefer a dashboard? It’s all in the full web app too. Same engine and data behind both; most teams use both.",
  },
  {
    q: "Which plans get the Slack bot?",
    a: "Every plan, including Free — Free just has a lower daily limit on questions. Outreach drafting is on the paid plans. The bot drafts the note; you send it from your own inbox, so nothing goes out without you.",
  },
  {
    q: "Where do screened candidates end up — can results land in our ATS?",
    a: "That’s coming — Ashby first. Candidates always apply through your EigenWork link and get screened there; the integration just changes where the results go — the ranked shortlist and notes flow into your own Ashby instead of staying in EigenWork. Your ATS is the endpoint, not the intake.",
  },
  {
    q: "Will candidates actually finish your screen, or will I lose the good ones?",
    a: "60-second intake. No timed coding gauntlet. They drop a PDF, paste a GitHub URL, pick a couple preferences, done. Strong engineers who already have offers actually finish it.",
  },
  {
    q: "What if my candidate has no public GitHub but a 10-year backend résumé?",
    a: "For senior candidates we read the résumé and the work history they list. GitHub is the signal for juniors who don’t yet have a track record at named employers. Both reach the same shortlist.",
  },
  {
    q: "What happens to a candidate's data after we hire (or don't)?",
    a: "Résumés and repo analyses are deleted 90 days after a role closes. Candidates can request earlier deletion any time. Payment is handled by Paddle; we don’t store card info.",
  },
];

function FaqBlock() {
  return (
    <div>
      <div className="max-w-2xl mb-12">
        <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] text-zinc-900 dark:text-zinc-100 leading-tight">
          Questions hiring teams actually ask.
        </h2>
      </div>

      <div className="max-w-3xl">
        {FAQ_ITEMS.map((item, i) => (
          <details
            key={i}
            className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 px-6 py-4 mb-3 group"
          >
            <summary className="cursor-pointer flex justify-between items-center text-base font-medium text-zinc-900 dark:text-zinc-100 list-none [&::-webkit-details-marker]:hidden gap-4">
              <span>{item.q}</span>
              <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-180 shrink-0" />
            </summary>
            <p className="mt-4 text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------- Icons ------------------------------------------------------------

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
