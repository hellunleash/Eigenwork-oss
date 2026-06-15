"use client";
import { useState } from "react";
import { ComparePricing } from "../../sections/compare-pricing";
import { HomeLoginModal } from "@/app/components/home-login-modal";
export default function ComparePricingPreview() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <ComparePricing onCta={() => setShowLogin(true)} />
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
