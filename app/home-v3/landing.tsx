"use client";

// =============================================================================
// /home-v3 — landing composition (PREVIEW; the live homepage still renders
// home-v2/landing). Committed-dark, evidence-lit redesign. Narrative order is
// deliberate: hook (Slack hero) → payoff (shortlist) → belief system (Why) →
// where it lives (front doors) → proof (analytics) → pricing → FAQ → CTA.
// Why and FAQ are NOT wrapped in <Reveal> — a transformed ancestor breaks
// their position: sticky rails.
// =============================================================================

import { useState } from "react";
import { HomeLoginModal } from "../components/home-login-modal";

import { Reveal } from "./motion";
import { SmoothScroll } from "./smooth-scroll";
import { HeroFilm } from "./engine/hero-film";
import { Nav } from "./sections/nav";
import { Thread } from "./sections/thread";
import { Showcase } from "./sections/showcase";
import { Why } from "./sections/why";
import { FrontDoors } from "./sections/front-doors";
import { AnalyticsPeek } from "./sections/analytics";
import { Pricing } from "./sections/pricing";
import { Faq } from "./sections/faq";
import { CtaFooter } from "./sections/cta-footer";

export default function HomeV3() {
  const [showLogin, setShowLogin] = useState(false);
  const open = () => setShowLogin(true);

  return (
    <div className="v3-root min-h-screen text-zinc-100 antialiased selection:bg-emerald-400/30 selection:text-emerald-50">
      <SmoothScroll />
      <Nav onSignIn={open} />
      <main>
        <HeroFilm onCta={open} />
        <Thread />
        <Showcase />
        <Why />
        <Reveal><FrontDoors /></Reveal>
        <Reveal><AnalyticsPeek /></Reveal>
        <Reveal><Pricing onCta={open} /></Reveal>
        <Faq />
        <CtaFooter onCta={open} />
      </main>
      <div className="v3-grain" aria-hidden="true" />
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
