"use client";

import { EtiPopover, ExpandableReason } from "./home-interactive";

export function HomeApplicantProfile() {
  return (
    <section className="py-16 md:py-20 bg-gray-50/50 dark:bg-white/[0.015] border-t border-gray-100 dark:border-white/[0.05] transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-6">
        <h2
          className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-10 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}
        >
          Applicant Profile
        </h2>
        <div
          className="max-w-2xl opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}
        >
          <div className="bg-white dark:bg-white/[0.02] rounded-xl border border-gray-200 dark:border-white/[0.05] shadow-sm dark:shadow-none overflow-hidden transition-all duration-300 hover:shadow-md hover:border-gray-300 dark:hover:border-white/[0.1]">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/80 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sarah Chen</h3>
                <EtiPopover />
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Operating Profile</h4>
                <div className="space-y-1.5">
                  <ExpandableReason
                    label="Ramp Expectation"
                    badge="Medium"
                    badgeClass="bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                    content="Can ship quickly in similar stacks; domain and tenancy details need time."
                  />
                  <ExpandableReason
                    label="Supervision Load"
                    badge="Low"
                    badgeClass="bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300"
                    content="Strong self-directed work history; prior remote roles show minimal oversight needed."
                  />
                  <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.05]">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Stack Transfer Risk</span>
                    <span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 text-xs font-medium rounded">Low</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Reliability Under Pressure</span>
                    <span className="px-2.5 py-0.5 bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 text-xs font-medium rounded">Medium</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Role Fit</h4>
                <span className="inline-block px-2.5 py-1 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                  Full-Stack Engineer (TypeScript | Next.js, React, PostgreSQL | AWS, Docker, Redis)
                </span>
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Risk Flags</h4>
                <span className="inline-block px-2.5 py-1 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-medium rounded">
                  Limited AWS production experience
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
