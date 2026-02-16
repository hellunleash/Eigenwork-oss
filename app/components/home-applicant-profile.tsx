"use client";

import { EtiPopover, ExpandableReason } from "./home-interactive";

export function HomeApplicantProfile() {
  return (
    <section className="py-16 md:py-20 bg-gray-50/50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <h2 
          className="text-2xl md:text-3xl font-semibold text-gray-900 mb-10 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}
        >
          Applicant Profile
        </h2>
        <div 
          className="max-w-2xl opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-gray-300">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-gray-900">Sarah Chen</h3>
                <EtiPopover />
                <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  High Trust
                </span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Operating Profile</h4>
                <div className="space-y-1.5">
                  <ExpandableReason 
                    label="Ramp Expectation"
                    badge="Medium"
                    badgeClass="bg-yellow-50 text-yellow-700"
                    content="Can ship quickly in similar stacks; domain and tenancy details need time."
                  />
                  <ExpandableReason 
                    label="Supervision Load"
                    badge="Low"
                    badgeClass="bg-green-50 text-green-700"
                    content="Strong self-directed work history; prior remote roles show minimal oversight needed."
                  />
                  <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-700">Stack Transfer Risk</span>
                    <span className="px-2.5 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded">Low</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700">Reliability Under Pressure</span>
                    <span className="px-2.5 py-0.5 bg-yellow-50 text-yellow-700 text-xs font-medium rounded">Medium</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Role Fit</h4>
                <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded">
                  Full-Stack Engineer (TypeScript | Next.js, React, PostgreSQL | AWS, Docker, Redis)
                </span>
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Risk Flags</h4>
                <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded">
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
