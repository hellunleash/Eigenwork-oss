"use client";

import { useState } from "react";
import { CtaFooter } from "../../sections/cta-footer";
import { HomeLoginModal } from "@/app/components/home-login-modal";

export default function CtaFooterPreview() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <CtaFooter onCta={() => setShowLogin(true)} />
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
