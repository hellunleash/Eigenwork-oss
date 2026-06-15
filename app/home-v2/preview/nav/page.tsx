"use client";

import { useState } from "react";
import { Nav } from "../../sections/nav";
import { HomeLoginModal } from "@/app/components/home-login-modal";

export default function NavPreview() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 antialiased">
      <Nav onSignIn={() => setShowLogin(true)} />
      {/* Fill space so scroll-shadow can be observed */}
      <div className="h-[200vh] p-12 text-zinc-400">Scroll to see the nav&apos;s shadow appear.</div>
      <HomeLoginModal show={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
