"use client";

import { useState } from "react";
import { HomeLoginModal } from "./home-login-modal";

export function HomeNav() {
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-white/[0.05] bg-white/80 dark:bg-[#0a0a0e]/80 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-[1.953125rem] font-semibold tracking-tight text-gray-900 dark:text-gray-100">EigenWork</span>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-4 py-2 text-sm font-medium text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors duration-200"
          >
            Get Started
          </button>
        </div>
      </nav>
      <HomeLoginModal show={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
