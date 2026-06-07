"use client";

import { HomeInteractive } from "./home-interactive";

export function HomeHero() {
  return (
    <section className="relative bg-hero-mesh pt-16 pb-14 md:pt-24 md:pb-20">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-4 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.05s", animationFillMode: "forwards" }}
        >
          Stop reviewing everyone,{" "}
          <span className="text-gray-600 dark:text-gray-400">start interviewing the right ones</span>
        </h1>
        <p
          className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8 leading-relaxed opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.15s", animationFillMode: "forwards" }}
        >
          Remove uncertainty from technical hiring. Every applicant is automatically evaluated and ranked with ETI — EigenTrustIndex.
        </p>
        <HomeInteractive />
      </div>
    </section>
  );
}
