"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";

export default function JDInputPage() {
  usePageTitle("Create Job");
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const handleSubmit = async () => {
    if (!text.trim()) return alert("Please paste a job description.");

    setLoading(true);

    try {
      const res = await fetch("/api/jd/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({jd: text }),
      });

      const data = await res.json();

      // Store the parsed fields in localStorage for Step 2 page
      if (data.success) {
        localStorage.setItem("parsedJD", JSON.stringify(data.data));

        // Redirect to the structured confirmation page
        window.location.href = "/user/jd/confirm";
      } else {
        alert("Could not parse the Job Description. Try again.");
      }
    } catch (err) {
      alert("Error connecting to server.");
    }

    setLoading(false);
  };

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: "14px" }}>Checking authentication…</p>
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
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
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
        }}
      >
        <div style={{ marginBottom: "32px" }}>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "8px",
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: "1.3",
            }}
          >
            Job Description
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#111827",
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            Paste your Tech Role Description. We'll extract and structure the key information automatically.
          </p>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste job description here..."
            style={{
              width: "100%",
              minHeight: "280px",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              outline: "none",
              fontSize: "14px",
              fontFamily: "inherit",
              color: "#111827",
              resize: "vertical",
              lineHeight: "1.6",
              transition: "border-color 0.15s ease",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#3b82f6";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#d1d5db";
            }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: loading ? "#9ca3af" : "#111827",
            color: "white",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer",
            border: "none",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "#374151";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "#111827";
            }
          }}
        >
          {loading ? "Processing..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
