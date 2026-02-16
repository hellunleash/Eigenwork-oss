"use client";

import { useState, useRef, useEffect } from "react";
import { HomeLoginModal } from "./home-login-modal";

export function HomeInteractive() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showEtiPopover, setShowEtiPopover] = useState(false);
  const [showRampReason, setShowRampReason] = useState(false);
  const [showSupervisionReason, setShowSupervisionReason] = useState(false);
  const etiPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEtiPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (etiPopoverRef.current && !etiPopoverRef.current.contains(e.target as Node)) {
        setShowEtiPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEtiPopover]);

  return (
    <>
      {/* Hero CTA Button */}
      <div 
        className="opacity-0 animate-fade-in-up"
        style={{ animationDelay: "0.25s", animationFillMode: "forwards" }}
      >
        <button
          onClick={() => setShowLoginModal(true)}
          className="inline-flex px-6 py-3 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-all duration-200 hover:shadow-lg hover:shadow-gray-900/10"
        >
          Get Started
        </button>
        <p className="mt-4 text-sm text-gray-500">
          No Setup. No forms. No Integrations.
        </p>
      </div>

      <HomeLoginModal show={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </>
  );
}

// Separate component for ETI popover
export function EtiPopover() {
  const [showEtiPopover, setShowEtiPopover] = useState(false);
  const etiPopoverRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!showEtiPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (etiPopoverRef.current && !etiPopoverRef.current.contains(e.target as Node)) {
        setShowEtiPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEtiPopover]);

  return (
    <span
      ref={etiPopoverRef}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setShowEtiPopover(true)}
      onMouseLeave={() => setShowEtiPopover(false)}
    >
      <span className="text-lg font-bold text-green-600">ETI: 78</span>
      <button
        type="button"
        onClick={() => setShowEtiPopover((v) => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/80 transition-colors duration-200"
        aria-label="ETI scale info"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </button>
      {showEtiPopover && (
        <div
          className="absolute left-0 top-full mt-2 z-50 origin-top-left animate-etipopover"
          role="tooltip"
        >
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg py-3 px-4 min-w-[300px]">
            <div className="flex gap-1 w-full">
              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-md bg-amber-100 text-amber-800 text-[10px] font-medium">
                <span>50–64</span>
                <span className="text-center leading-tight">Promising but needs support</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-md bg-green-100 text-green-800 text-[10px] font-medium">
                <span>65–79</span>
                <span className="text-center leading-tight">Strong contributor</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-md bg-teal-100 text-teal-800 text-[10px] font-medium">
                <span>80+</span>
                <span className="text-center leading-tight">Low supervision. High Leverage</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

// Separate component for expandable reasons
export function ExpandableReason({ 
  label, 
  badge,
  badgeClass,
  content 
}: { 
  label: string; 
  badge?: string;
  badgeClass?: string;
  content: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border-b border-gray-50 pb-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700">{label}</span>
        <div className="flex items-center gap-1">
          {badge && (
            <span className={`px-2.5 py-0.5 ${badgeClass || "bg-gray-50 text-gray-700"} text-xs font-medium rounded`}>
              {badge}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((e) => !e)}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
            aria-expanded={isExpanded}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-2 pl-0">
          <div className="bg-gray-100 text-gray-600 text-sm rounded px-3 py-2 border border-gray-200">{content}</div>
        </div>
      )}
    </div>
  );
}
