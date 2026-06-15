"use client";

import { useState } from "react";
import { HomeLoginModal } from "../components/home-login-modal";

import { Reveal } from "./motion";
import { Nav } from "./sections/nav";
import { Hero } from "./sections/hero";
import { TrustStrip } from "./sections/trust-strip";
import { Problem } from "./sections/problem";
import { Workflow } from "./sections/workflow";
import { Showcase } from "./sections/showcase";
import { Why } from "./sections/why";
import { ComparePricing } from "./sections/compare-pricing";
import { TestimonialsFaq } from "./sections/testimonials-faq";
import { CtaFooter } from "./sections/cta-footer";

export default function HomeV2() {
  const [showLogin, setShowLogin] = useState(false);
  const open = () => setShowLogin(true);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <Nav onSignIn={open} />
      <Hero onCta={open} />
      <Reveal><TrustStrip /></Reveal>
      <Reveal stagger><Problem /></Reveal>
      <Reveal stagger><Workflow /></Reveal>
      <Reveal><Showcase /></Reveal>
      <Reveal><Why /></Reveal>
      <Reveal><ComparePricing onCta={open} /></Reveal>
      <Reveal><TestimonialsFaq /></Reveal>
      <Reveal><CtaFooter onCta={open} /></Reveal>
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
