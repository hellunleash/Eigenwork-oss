"use client";

import { useEffect, useState } from "react";
import { usePageTitle } from "@/lib/use-page-title";

export default function MatchPage() {
  usePageTitle("Matching");
  const [jd, setJD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("finalJD");
    if (saved) {
      try {
        setJD(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse JD from localStorage:", err);
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
        }}
      >
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          background: "white",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          padding: "48px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#111827",
            letterSpacing: "-0.025em",
          }}
        >
          Matching candidates...
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: 0,
            lineHeight: "1.5",
          }}
        >
          {jd ? `Finding matches for: ${jd.title || "your role"}` : "No job description found"}
        </p>
      </div>
    </div>
  );
}
