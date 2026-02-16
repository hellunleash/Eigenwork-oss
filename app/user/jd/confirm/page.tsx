"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanTitle(title: string): string {
  return (title || "").replace(/\s*\[[^\]]*\]\s*/g, " ").trim().replace(/\s+/g, " ") || "";
}

function buildOneLiner(
  title: string,
  primary: string[],
  secondary: string[],
  tertiary: string[]
): string {
  const seen = new Set<string>();
  const primaryDisplay = primary.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
  const secondaryDisplay = secondary.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
  const tertiaryDisplay = tertiary.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
  const parts: string[] = [];
  if (primaryDisplay.length) parts.push(primaryDisplay.join(", "));
  if (secondaryDisplay.length) parts.push(secondaryDisplay.join(", "));
  if (tertiaryDisplay.length) parts.push(tertiaryDisplay.join(", "));
  const suffix = parts.length ? ` (${parts.join(" | ")})` : "";
  return cleanTitle(title) + suffix;
}

function JDConfirmContent() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryRaw, setPrimaryRaw] = useState<string>("");
  const [secondaryRaw, setSecondaryRaw] = useState<string>("");
  const [tertiaryRaw, setTertiaryRaw] = useState<string>("");
  const submissionCapInputRef = useRef<HTMLInputElement>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get("jobId");

  useEffect(() => {
    const loadInitial = async () => {
      if (jobIdFromUrl) {
        try {
          const res = await fetch(`/api/jd/${encodeURIComponent(jobIdFromUrl)}`);
          if (!res.ok) throw new Error("Failed to load job");
          const data = await res.json();
          const authReq = (data.work_auth_requirement as { us_required?: boolean; eu_required?: boolean; provided?: boolean }) ?? {};
          const rf = (data.role_fit as { title?: string; primary?: string[]; secondary?: string[]; tertiary?: string[] }) ?? {};
          setForm({
            title: data.title ?? "",
            seniority: data.seniority ?? "",
            role_category: data.role_category ?? "",
            location_type: data.location_type ?? "",
            yoe_required: data.yoe_required ?? "",
            employment_type: data.employment_type ?? "",
            work_auth_us_required: Boolean(authReq.us_required),
            work_auth_eu_required: Boolean(authReq.eu_required),
            work_auth_provided: Boolean(authReq.provided),
            submissionCap: typeof data.submissionCap === "number" ? data.submissionCap : undefined,
          });
          setPrimaryRaw(Array.isArray(rf.primary) ? rf.primary.join(", ") : "");
          setSecondaryRaw(Array.isArray(rf.secondary) ? rf.secondary.join(", ") : "");
          setTertiaryRaw(Array.isArray(rf.tertiary) ? rf.tertiary.join(", ") : "");
        } catch {
          setForm(null);
        } finally {
          setLoading(false);
        }
        return;
      }
      const saved = localStorage.getItem("parsedJD");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.submissionCap !== "number" || parsed.submissionCap < 1) {
          parsed.submissionCap = undefined;
        }
        setForm(parsed);
        if (Array.isArray(parsed.primary)) setPrimaryRaw(parsed.primary.join(", "));
        if (Array.isArray(parsed.secondary)) setSecondaryRaw(parsed.secondary.join(", "));
        if (Array.isArray(parsed.tertiary)) setTertiaryRaw(parsed.tertiary.join(", "));
      }
      setLoading(false);
    };
    loadInitial();
  }, [jobIdFromUrl]);

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

  if (authChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-gray-900 mb-4"></div>
          <p className="text-sm text-gray-600 animate-pulse-subtle">Checking authentication…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-gray-900 mb-4"></div>
          <p className="text-sm text-gray-600 animate-pulse-subtle">Loading…</p>
        </div>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="max-w-md w-full text-center animate-scale-in">
          <div className="mb-6 animate-bounce-in">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {jobIdFromUrl ? "Job Not Found" : "No Job Data"}
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {jobIdFromUrl ? "This job doesn't exist or you don't have access to it." : "No job data to confirm. Start from the pipeline creation flow."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/user/dashboard")}
            className="inline-flex px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all duration-200 hover:shadow-lg hover:shadow-gray-900/10 active:scale-[0.98]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const update = (field: string, value: any) =>
    setForm((p: any) => ({ ...p, [field]: value }));

  const primary = parseCommaSeparated(primaryRaw);
  const secondary = parseCommaSeparated(secondaryRaw);
  const tertiary = parseCommaSeparated(tertiaryRaw);
  const generatedOneLiner = buildOneLiner(form.title || "", primary, secondary, tertiary);
  const cleanTitleVal = cleanTitle(form.title || "");
  const suffix = generatedOneLiner.substring(cleanTitleVal.length);

  const handleContinue = async () => {
    setError(null);
    // Use current input value so we never send stale state (e.g. user typed 1 but state was still 2)
    const inputVal = submissionCapInputRef.current?.value ?? form.submissionCap;
    const cap = inputVal === "" || inputVal === undefined ? undefined : Number(inputVal);
    if (cap === undefined || cap === null || Number.isNaN(cap)) {
      setError("Please enter an Applicant Limit (at least 1).");
      submissionCapInputRef.current?.focus();
      return;
    }
    const num = Math.floor(cap);
    if (num < 1) {
      setError("Please enter an Applicant Limit of at least 1.");
      submissionCapInputRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        submissionCap: num,
        role_fit: {
          title: cleanTitleVal,
          primary,
          secondary,
          tertiary,
          one_liner: generatedOneLiner,
        },
        userId: auth.currentUser?.uid ?? null,
        ...(jobIdFromUrl ? { jobId: jobIdFromUrl } : {}),
      };
      const res = await fetch("/api/jd/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save JD");
      const data = await res.json();
      const jobId = data.jobId;
      if (jobId && !jobIdFromUrl) {
        localStorage.setItem("finalJD", JSON.stringify({ ...form, submissionCap: num }));
        localStorage.setItem("finalJDId", jobId);
      }
      router.push("/user/dashboard");
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Sticky Header */}
      <nav className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md transition-all duration-300">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push("/user/dashboard")}
            className="text-sm text-gray-600 hover:text-gray-900 transition-all duration-200 flex items-center gap-1.5 group hover:gap-2"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>
          <span className="text-lg font-semibold tracking-tight text-gray-900">EigenWork</span>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 py-8 md:py-12">
        <div className="max-w-4xl mx-auto px-6">
          {/* Page Header */}
          <div className="mb-8 opacity-0 animate-fade-in-up" style={{ animationDelay: "0.05s", animationFillMode: "forwards" }}>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 mb-2">
              {jobIdFromUrl ? "Edit Role" : "Review & Confirm"}
            </h1>
            <p className="text-gray-600">
              {jobIdFromUrl ? "Update your role details and settings" : "Review the extracted details and configure your pipeline"}
            </p>
          </div>

          <div className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 animate-bounce-in">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Role Details Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-0 animate-fade-in-up hover:shadow-md hover:border-gray-300 transition-all duration-300" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Role Details
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Core information about the position</p>
              </div>
              <div className="p-6 space-y-5">
                {/* Role Title (One-Liner) */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Role Title (One-Liner)
                  </label>
                  <div className="flex gap-0 group">
                    <input
                      type="text"
                      value={form.title || ""}
                      onChange={(e) => update("title", e.target.value)}
                      onFocus={() => setFocusedField("title")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g. Software Engineer"
                      className={`flex-1 min-w-0 px-4 py-2.5 border border-r-0 rounded-l-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset focus:z-10 transition-all duration-200 ${focusedField === "title" ? "border-gray-300 shadow-sm" : "border-gray-200"}`}
                    />
                    <div
                      className={`px-4 py-2.5 border rounded-r-lg bg-gray-50 text-sm overflow-hidden text-ellipsis min-w-[140px] max-w-[55%] flex items-center transition-all duration-200 ${suffix ? "text-gray-700 border-gray-200" : "text-gray-400 italic border-gray-200"} ${focusedField === "title" ? "border-gray-300" : ""}`}
                      title={suffix || "Add Primary/Secondary/Tertiary stack below"}
                    >
                      {suffix || "(Add stack below)"}
                    </div>
                  </div>
                </div>

                {/* Seniority & Role Category Grid */}
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1.5">
                      Seniority
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300 cursor-pointer"
                      value={form.seniority || ""}
                      onChange={(e) => update("seniority", e.target.value)}
                      onFocus={() => setFocusedField("seniority")}
                      onBlur={() => setFocusedField(null)}
                    >
                      <option value="">Select seniority</option>
                      <option>Intern</option>
                      <option>Junior</option>
                      <option>Mid</option>
                      <option>Senior</option>
                      <option>Staff</option>
                      <option>Principal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1.5">
                      Role Category
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300 cursor-pointer"
                      value={form.role_category || ""}
                      onChange={(e) => update("role_category", e.target.value)}
                      onFocus={() => setFocusedField("role_category")}
                      onBlur={() => setFocusedField(null)}
                    >
                      <option value="">Select category</option>
                      <option>Backend</option>
                      <option>Frontend</option>
                      <option>Fullstack</option>
                      <option>AI/ML</option>
                      <option>Data</option>
                      <option>DevOps</option>
                      <option>Mobile</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Stack Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-0 animate-fade-in-up hover:shadow-md hover:border-gray-300 transition-all duration-300" style={{ animationDelay: "0.15s", animationFillMode: "forwards" }}>
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Technical Stack
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Define the technologies and tools required</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Primary
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300"
                    placeholder="e.g. C#/.NET, Python"
                    value={primaryRaw}
                    onChange={(e) => setPrimaryRaw(e.target.value)}
                    onFocus={() => setFocusedField("primary")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Secondary
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300"
                    placeholder="e.g. REST APIs, Redis, Docker"
                    value={secondaryRaw}
                    onChange={(e) => setSecondaryRaw(e.target.value)}
                    onFocus={() => setFocusedField("secondary")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Tertiary
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300"
                    placeholder="e.g. Azure DevOps, Git"
                    value={tertiaryRaw}
                    onChange={(e) => setTertiaryRaw(e.target.value)}
                    onFocus={() => setFocusedField("tertiary")}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
                {/* Stack Preview */}
                {(primary.length > 0 || secondary.length > 0 || tertiary.length > 0) && (
                  <div className="pt-4 border-t border-gray-100 animate-slide-in-right">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview
                    </p>
                    <div className="space-y-2.5 text-sm">
                      {primary.length > 0 && (
                        <div className="flex gap-3 p-2 rounded-md bg-gray-50/50 transition-colors hover:bg-gray-50">
                          <span className="text-gray-500 font-medium min-w-[80px]">Primary:</span>
                          <span className="text-gray-700">{primary.join(", ")}</span>
                        </div>
                      )}
                      {secondary.length > 0 && (
                        <div className="flex gap-3 p-2 rounded-md bg-gray-50/50 transition-colors hover:bg-gray-50">
                          <span className="text-gray-500 font-medium min-w-[80px]">Secondary:</span>
                          <span className="text-gray-700">{secondary.join(", ")}</span>
                        </div>
                      )}
                      {tertiary.length > 0 && (
                        <div className="flex gap-3 p-2 rounded-md bg-gray-50/50 transition-colors hover:bg-gray-50">
                          <span className="text-gray-500 font-medium min-w-[80px]">Tertiary:</span>
                          <span className="text-gray-700">{tertiary.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Work Arrangement Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-0 animate-fade-in-up hover:shadow-md hover:border-gray-300 transition-all duration-300" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Work Arrangement
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Location, experience, and employment details</p>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1.5">
                      Location Type
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300 cursor-pointer"
                      value={form.location_type || ""}
                      onChange={(e) => update("location_type", e.target.value)}
                      onFocus={() => setFocusedField("location")}
                      onBlur={() => setFocusedField(null)}
                    >
                      <option value="">Select location</option>
                      <option>Remote</option>
                      <option>Hybrid</option>
                      <option>On-site</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1.5">
                      Years of Experience
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300"
                      placeholder="e.g. 3"
                      value={form.yoe_required || ""}
                      onChange={(e) => update("yoe_required", e.target.value)}
                      onFocus={() => setFocusedField("yoe")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Employment Type
                  </label>
                    <select
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 hover:border-gray-300 cursor-pointer"
                      value={form.employment_type || ""}
                      onChange={(e) => update("employment_type", e.target.value)}
                      onFocus={() => setFocusedField("employment")}
                      onBlur={() => setFocusedField(null)}
                    >
                    <option value="">Select type</option>
                    <option>Full-time</option>
                    <option>Intern</option>
                    <option>Contract</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Work Authorization Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-0 animate-fade-in-up hover:shadow-md hover:border-gray-300 transition-all duration-300" style={{ animationDelay: "0.25s", animationFillMode: "forwards" }}>
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Work Authorization
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Specify authorization requirements</p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-50 transition-all duration-200">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-2 focus:ring-gray-900 cursor-pointer transition-all duration-200"
                      checked={form.work_auth_us_required || false}
                      onChange={(e) => update("work_auth_us_required", e.target.checked)}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors duration-200">US work authorization required</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-50 transition-all duration-200">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-2 focus:ring-gray-900 cursor-pointer transition-all duration-200"
                      checked={form.work_auth_eu_required || false}
                      onChange={(e) => update("work_auth_eu_required", e.target.checked)}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors duration-200">EU work authorization required</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-50 transition-all duration-200">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-2 focus:ring-gray-900 cursor-pointer transition-all duration-200"
                      checked={form.work_auth_provided || false}
                      onChange={(e) => update("work_auth_provided", e.target.checked)}
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors duration-200">Work authorization will be provided</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Pipeline Settings Card */}
            <div className={`bg-white rounded-xl border shadow-sm overflow-hidden opacity-0 animate-fade-in-up hover:shadow-md transition-all duration-300 ${error ? "border-red-200" : "border-gray-200 hover:border-gray-300"}`} style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-transparent">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Pipeline Settings
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Configure applicant intake limits</p>
              </div>
              <div className="p-6">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Applicant Limit
                  </label>
                  <input
                    ref={submissionCapInputRef}
                    type="number"
                    min={1}
                    className={`w-full px-4 py-2.5 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-inset transition-all duration-200 ${error ? "border-red-300 focus:ring-red-500" : "border-gray-200 hover:border-gray-300"}`}
                    placeholder="e.g. 50"
                    value={form.submissionCap === undefined || form.submissionCap === "" ? "" : form.submissionCap}
                    onChange={(e) => {
                      const v = e.target.value;
                      update("submissionCap", v === "" ? "" : Number(v));
                      if (error) setError(null);
                    }}
                    onFocus={() => {
                      setFocusedField("submissionCap");
                      if (error) setError(null);
                    }}
                    onBlur={() => setFocusedField(null)}
                  />
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                    The intake link closes when the applicant limit is reached. Shortlisting unlocks after at least 60% of the limit is collected.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 opacity-0 animate-fade-in-up" style={{ animationDelay: "0.35s", animationFillMode: "forwards" }}>
              <button
                type="button"
                onClick={() => router.push("/user/dashboard")}
                className="flex-1 sm:flex-none px-6 py-3 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={saving}
                className="flex-1 sm:flex-auto px-6 py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-gray-900/10 active:scale-[0.98] relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving…
                    </>
                  ) : (
                    <>
                      {jobIdFromUrl ? "Save Changes" : "Create Pipeline"}
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </span>
                {!saving && (
                  <span className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JDConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-gray-900 mb-4"></div>
          <p className="text-sm text-gray-600 animate-pulse-subtle">Loading…</p>
        </div>
      </div>
    }>
      <JDConfirmContent />
    </Suspense>
  );
}
