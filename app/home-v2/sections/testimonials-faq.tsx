// =============================================================================
// Testimonials + FAQ section for /home-v2.
// Unit 9 of the homepage-v2 redesign batch. Self-contained — no shared deps.
//
// Subsection 1: Mock testimonials. Clearly marked as MOCK in JSX comments;
// strip the comments and swap copy when real customer quotes are ready.
//
// Subsection 2: FAQ for hiring teams. Plain-English answers, recruiter POV,
// zero engine vocab.
// =============================================================================

export function TestimonialsFaq() {
  return (
    <section className="py-24 md:py-32 bg-white dark:bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto px-6">
        <TestimonialsBlock />
        <FaqBlock />
      </div>
    </section>
  );
}

// ---------- Testimonials -----------------------------------------------------

function TestimonialsBlock() {
  return (
    <div className="mb-24 md:mb-32">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
          WHAT TEAMS SAY
        </p>
        <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] text-zinc-900 dark:text-zinc-100 leading-tight">
          Hiring leads who stopped reading r&eacute;sum&eacute;s.
        </h2>
      </div>

      {/* MOCK TESTIMONIAL — replace when real customers ship */}
      <figure className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900 p-10 md:p-14 max-w-4xl mx-auto mb-8">
        <QuoteGlyph className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-6" />
        <blockquote className="text-2xl md:text-3xl font-medium tracking-tight leading-snug text-zinc-900 dark:text-zinc-100">
          We hired two seniors in 11 days. The third interview we ran was the one we extended.
          Before this we were burning a week per role on take-homes that the good candidates
          wouldn&rsquo;t even start.
        </blockquote>
        <figcaption className="mt-8 flex items-center gap-4">
          <Avatar initials="SC" size="lg" />
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Sarah Chen</p>
            <p className="text-sm text-zinc-500">
              Head of Engineering, Series B fintech (15-person team)
            </p>
          </div>
        </figcaption>
      </figure>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MOCK TESTIMONIAL — replace when real customers ship */}
        <figure className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-[#101013] p-8">
          <QuoteGlyph className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mb-4" />
          <blockquote className="text-base md:text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
            The risk flags caught a candidate who&rsquo;d staged a repo. Saved us two interview
            rounds before we wasted the time.
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <Avatar initials="MT" size="sm" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Marcus Tate</p>
              <p className="text-xs text-zinc-500">Founding engineer, YC W25 startup</p>
            </div>
          </figcaption>
        </figure>

        {/* MOCK TESTIMONIAL — replace when real customers ship */}
        <figure className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-[#101013] p-8">
          <QuoteGlyph className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mb-4" />
          <blockquote className="text-base md:text-lg text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
            The shortlist felt like someone read every r&eacute;sum&eacute; carefully — but it came
            back in 90 seconds. My hiring manager finally trusted my recs.
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <Avatar initials="PI" size="sm" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Priya Iyer</p>
              <p className="text-xs text-zinc-500">Recruiter Lead, growth-stage SaaS</p>
            </div>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

function Avatar({ initials, size }: { initials: string; size: "sm" | "lg" }) {
  const sizing = size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-xs";
  return (
    <div
      className={`${sizing} rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-semibold text-zinc-700 dark:text-zinc-300 shrink-0`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

// ---------- FAQ --------------------------------------------------------------

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "Will candidates actually finish your screen, or will I lose the good ones?",
    a: "60-second intake. No timed coding gauntlet. They drop a PDF, paste a GitHub URL, pick a couple preferences, done. Strong engineers who already have offers actually finish it.",
  },
  {
    q: "What if my candidate has no public GitHub but a 10-year backend résumé?",
    a: "For senior candidates we lean on the résumé and verified work history. GitHub is the signal for juniors who don’t yet have a track record at named employers. Both tracks reach the same shortlist.",
  },
  {
    q: "Can candidates game the ranking?",
    a: "We watch for the giveaways — repos built in a day, commits that aren’t theirs, claims that don’t match what the code does. When we spot inflation, we cap the candidate and flag them so you know.",
  },
  {
    q: "Do I need to install something, or set up an ATS integration?",
    a: "No. Paste a job description. Share one link. Sign in is Google. There’s no integration step and no SDR call — you can be live in 60 seconds.",
  },
  {
    q: "How does this work if I'm hiring for 5 different roles?",
    a: "The Team plan covers up to 10 active roles for 6 months. Each role gets its own intake link and its own shortlist. Everything stays in one shared workspace.",
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
        <p className="text-xs font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">FAQ</p>
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

function QuoteGlyph({ className }: { className?: string }) {
  // Opening curly-quote — pure shape, no decorative quote text.
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 8c-3.9 0-7 3.1-7 7v9h9v-9H6c0-1.7 1.3-3 3-3V8zm14 0c-3.9 0-7 3.1-7 7v9h9v-9h-5c0-1.7 1.3-3 3-3V8z" />
    </svg>
  );
}

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
