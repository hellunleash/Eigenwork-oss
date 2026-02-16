"use client";

import { useState } from "react";
import { HomeLoginModal } from "./home-login-modal";

export function HomeNav() {
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-[1.953125rem] font-semibold tracking-tight text-gray-900">EigenWork</span>
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors duration-200"
          >
            Get Started
          </button>
        </div>
      </nav>
      <HomeLoginModal show={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}
