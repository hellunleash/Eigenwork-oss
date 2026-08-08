// =============================================================================
// v3 FAQ — same six real, recruiter-voiced questions as live (no testimonials;
// none exist — honesty rule). Split layout: heading holds the left rail while
// the disclosures scroll; native <details> animated via ::details-content +
// interpolate-size where the browser supports it, instant elsewhere.
// =============================================================================

import { ChevronDown } from "../icons";

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

export function Faq() {
  return (
    <section className="v3-faq py-24 md:py-32 border-t border-white/[0.05]">
      <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-[0.8fr_1.2fr] gap-y-10 lg:gap-x-20">
        <div className="lg:sticky lg:top-28 self-start">
          <h2 className="v3-display text-3xl md:text-5xl font-semibold leading-[1.05] text-zinc-50 text-balance">
            Questions hiring teams actually ask.
          </h2>
        </div>

        <div>
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={i}
              className="group border-b border-white/[0.07] px-1 py-5 open:pb-6"
            >
              <summary className="cursor-pointer flex justify-between items-center gap-4 text-base md:text-[17px] font-medium text-zinc-100 list-none [&::-webkit-details-marker]:hidden hover:text-emerald-300 transition-colors">
                <span>{item.q}</span>
                <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-white/[0.1] text-zinc-400 transition-transform duration-300 group-open:rotate-180 group-open:text-emerald-300 group-open:border-emerald-400/30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </span>
              </summary>
              <p className="mt-3 max-w-[62ch] text-sm md:text-base text-zinc-400 leading-relaxed text-pretty">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
