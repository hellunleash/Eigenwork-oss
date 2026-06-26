"use client";

// The main landing IS the promoted draft composition (formerly only at
// /home-v2/preview/landing). Slack-native + multi-entry redesign: it reuses the
// already-built sections-draft components verbatim — nothing here is rewritten.
// `/` re-exports this file's default, so this is the single source of truth for
// the homepage.

import { useState } from "react";
import { HomeLoginModal } from "../components/home-login-modal";

import { Reveal } from "./motion";
import { Nav } from "./sections-draft/nav";
import { Hero } from "./sections-draft/hero";
import { FrontDoors } from "./sections-draft/front-doors";
import { Showcase } from "./sections-draft/showcase";
import { Why } from "./sections-draft/why";
import { AnalyticsPeek } from "./sections-draft/analytics-peek";
import { Pricing } from "./sections-draft/pricing";
import { TestimonialsFaq } from "./sections-draft/testimonials-faq";
import { CtaFooter } from "./sections/cta-footer";

export default function HomeV2() {
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
