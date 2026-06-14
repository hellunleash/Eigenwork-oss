export function HomeHowItWorks() {
  return (
    <section className="pt-12 pb-16 md:pt-16 md:pb-24 border-t border-gray-100 dark:border-white/[0.05] bg-gray-50/30 dark:bg-white/[0.015] transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-6">
        <p
          className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}
        >
          How it works
        </p>
        <div className="relative space-y-0">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-8 bottom-8 w-px bg-gradient-to-b from-gray-200 dark:from-white/10 via-gray-200 dark:via-white/10 to-transparent hidden md:block" />

          {/* Step 01 */}
          <div
            className="relative flex gap-6 md:gap-8 pb-14 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-sm font-semibold z-10">
              1
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add your role</h3>
              <p className="mt-1.5 text-gray-600 dark:text-gray-400 text-[15px] leading-relaxed">
                Paste your JD-we extract the rest.
              </p>
            </div>
          </div>

          {/* Step 02 — Share the link + LinkedIn snippet */}
          <div
            className="relative flex gap-6 md:gap-8 pb-14 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-sm font-semibold z-10">
              2
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Share the intake link</h3>
              <p className="mt-1.5 text-gray-600 dark:text-gray-400 text-[15px] leading-relaxed mb-6">
                Drop the link anywhere you already source candidates from.
              </p>
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] shadow-sm overflow-hidden ring-1 ring-black/5 dark:ring-white/5 space-y-3 px-4 py-3">
                {/* Software Engineer card */}
                <div className="rounded-lg border border-gray-200 dark:border-white/[0.05] bg-gray-50/80 dark:bg-white/[0.03] p-3">
                  <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">Software Engineer</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">1 candidate evaluated (Applicant limit 1)</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex px-3 py-1.5 bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">View Top Candidates</span>
                    <span className="inline-flex px-3 py-1.5 bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">Edit role settings</span>
                    <span className="inline-flex px-3 py-1.5 bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">Copy Intake Link</span>
                    <span className="inline-flex px-3 py-1.5 bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg">Delete</span>
                  </div>
                </div>
                {/* Full Stack Developer card */}
                <div className="rounded-lg border border-gray-200 dark:border-white/[0.05] bg-gray-50/80 dark:bg-white/[0.03] p-3">
                  <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">Full Stack Developer</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">0 submissions yet (Applicant limit 100)</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex px-3 py-1.5 bg-gray-100 dark:bg-white/[0.04] text-gray-400 dark:text-gray-500 text-xs font-medium rounded-lg">Waiting for submissions</span>
                    <span className="inline-flex px-3 py-1.5 bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">Edit role settings</span>
                    <span className="inline-flex px-3 py-1.5 bg-gray-200 dark:bg-white/[0.08] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">Copy Intake Link</span>
                    <span className="inline-flex px-3 py-1.5 bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg">Delete</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 03 — See top profiles + Results page snippet */}
          <div
            className="relative flex gap-6 md:gap-8 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.4s", animationFillMode: "forwards" }}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-sm font-semibold z-10">
              3
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">See top profiles</h3>
              <p className="mt-1.5 text-gray-600 dark:text-gray-400 text-[15px] leading-relaxed mb-6">
                Every applicant gets an ETI score. Review the best candidates first.
              </p>
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] shadow-sm overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pipeline Results</h4>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {[
                    { score: 82, name: "Marcus Webb", email: "mwebb.dev@outlook.example", roleFit: "Software Development Engineer (Java, Node.js | Express.js, MongoDB, Mongoose)", location: "Onsite", workType: "Full-time", workAuth: "—" },
                    { score: 76, name: "Ashi", email: "ashi@protonmail.example", roleFit: "Software Development Engineer (Java, Go | Spring Boot, PostgreSQL, Kafka)", location: "Onsite", workType: "Full-time", workAuth: "—" },
                    { score: 74, name: "James Okonkwo", email: "j.okonkwo.dev@gmail.example", roleFit: "Software Development Engineer (Java, Ruby | Rails, Sidekiq, PostgreSQL)", location: "Onsite", workType: "Full-time", workAuth: "—" },
                  ].map((c, i) => (
                    <li key={i} className="px-4 py-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.03] transition-colors">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-base font-bold text-gray-900 dark:text-gray-100">ETI {c.score}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{c.name} • {c.email}</p>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{c.roleFit}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{c.location} • {c.workType} • {c.workAuth}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium rounded-lg">View Candidate Card</span>
                        <span className="inline-flex px-3 py-1.5 border border-gray-200 dark:border-white/[0.1] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">Download Resume ↓</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
