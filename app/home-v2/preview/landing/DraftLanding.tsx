"use client";

// =============================================================================
// DRAFT full-page composition (preview only). Slack-native + MULTI-ENTRY, with
// the substance restored:
//   Nav(draft, "Why EigenWork" replaces Changelog) → Hero (Slack thread) →
//   FrontDoors (two doors, one engine) → Showcase (the result you get) →
//   Why (why it's trustworthy) → AnalyticsPeek (KPI / what you learn) →
//   Pricing (Slack-framed) → FAQ → CTA.
// The standalone Trust pillars were dropped — Why now covers that ground.
// Live "/" stays untouched until promotion.
// =============================================================================

import { useState } from "react";
import { HomeLoginModal } from "@/app/components/home-login-modal";

import { Reveal } from "@/app/home-v2/motion";
import { Nav } from "@/app/home-v2/sections-draft/nav";
import { Hero } from "@/app/home-v2/sections-draft/hero";
import { FrontDoors } from "@/app/home-v2/sections-draft/front-doors";
import { Showcase } from "@/app/home-v2/sections-draft/showcase";
import { Why } from "@/app/home-v2/sections-draft/why";
import { AnalyticsPeek } from "@/app/home-v2/sections-draft/analytics-peek";
import { Pricing } from "@/app/home-v2/sections-draft/pricing";
import { TestimonialsFaq } from "@/app/home-v2/sections-draft/testimonials-faq";
import { CtaFooter } from "@/app/home-v2/sections/cta-footer";

export function DraftLanding() {
  const [showLogin, setShowLogin] = useState(false);
  const open = () => setShowLogin(true);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <Nav onSignIn={open} />
      <Hero onCta={open} />
      <Reveal><FrontDoors /></Reveal>
      <Reveal><Showcase /></Reveal>
      <Why />
      <Reveal><AnalyticsPeek /></Reveal>
      <Reveal><Pricing onCta={open} /></Reveal>
      <Reveal><TestimonialsFaq /></Reveal>
      <Reveal><CtaFooter onCta={open} /></Reveal>
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
