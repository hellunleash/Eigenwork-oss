"use client";

import { useState } from "react";
import { Hero } from "../../sections/hero";
import { HomeLoginModal } from "@/app/components/home-login-modal";

export default function HeroPreview() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <Hero onCta={() => setShowLogin(true)} />
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
