"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { usePageTitle } from "@/lib/use-page-title";
import { PreviewSidebar } from "../../PreviewSidebar";
import { cleanTitle, buildOneLiner } from "@/lib/jd-role-fit";
import {
  WORK_AUTH_OPTIONS,
  LOCATION_TYPES,
  EMPLOYMENT_TYPES,
  workAuthChoiceToBooleans,
  workAuthBooleansToChoice,
  type WorkAuthChoice,
} from "@/lib/jd-options";

type JDForm = {
  title: string;
  seniority: string;
  role_category: string;
  location_type: string;
  yoe_required: string;
  employment_type: string;
  work_auth_us_required: boolean;
  work_auth_eu_required: boolean;
  work_auth_provided: boolean;
  submissionCap?: number | "" | undefined;
  // ADR-013: role-function facet from the JD parser; passed through to save via
  // the `...form` spread. Not an editable UI field.
  ml_mode?: string;
};

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Match the existing app product surfaces (dashboard / analytics / sidebar):
// gray neutrals, dark #0a0a0a canvas, subtle bordered cards (border-white/[0.06]
// on bg-white/[0.02]), emerald used only as an accent, soft emerald field focus.
const CARD =
  "rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-6 md:p-7";
const FIELD =
  "w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-colors";
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

// Work-auth options + location/employment choices + the boolean⇄choice mapping
// live in @/lib/jd-options (single source of truth, shared with the Slack intake
// flow). Radios still stop recruiters from setting contradictory states like
// "US + EU both" (an unsatisfiable AND) or "sponsor + region required".

function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{desc}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function JDConfirmContent() {
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [form, setForm] = useState<JDForm | null>(null);
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
  usePageTitle(jobIdFromUrl ? "Edit Role" : "Review & Confirm");

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
        setForm({
          title: String(parsed.title ?? ""),
          seniority: String(parsed.seniority ?? ""),
          role_category: String(parsed.role_category ?? ""),
          location_type: String(parsed.location_type ?? ""),
          yoe_required: String(parsed.yoe_required ?? ""),
          employment_type: String(parsed.employment_type ?? ""),
          work_auth_us_required: Boolean(parsed.work_auth_us_required),
          work_auth_eu_required: Boolean(parsed.work_auth_eu_required),
          work_auth_provided: Boolean(parsed.work_auth_provided),
          submissionCap: parsed.submissionCap,
          ml_mode: typeof parsed.ml_mode === "string" ? parsed.ml_mode : "n/a",
        });
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
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 dark:border-white/[0.1] border-t-emerald-500 mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse-subtle">Checking authentication…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 dark:border-white/[0.1] border-t-emerald-500 mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse-subtle">Loading…</p>
        </div>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="mb-6">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {jobIdFromUrl ? "Job Not Found" : "No Job Data"}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {jobIdFromUrl ? "This job doesn't exist or you don't have access to it." : "No job data to confirm. Start from the pipeline creation flow."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/user/dashboard")}
            className="inline-flex px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 transition active:scale-[0.98]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const update = <K extends keyof JDForm>(field: K, value: JDForm[K]) =>
    setForm((p) => ({ ...(p ?? ({} as JDForm)), [field]: value }));

  // Collapse the three persisted booleans into the single active choice, and
  // expand a chosen option back into exactly one boolean (or none) — shared
  // mappers so the web form and the Slack intake flow agree.
  const workAuthChoice: WorkAuthChoice = workAuthBooleansToChoice(form);
  const setWorkAuthChoice = (v: WorkAuthChoice) =>
    setForm((p) => (p ? { ...p, ...workAuthChoiceToBooleans(v) } : p));

  const primary = parseCommaSeparated(primaryRaw);
  const secondary = parseCommaSeparated(secondaryRaw);
  const tertiary = parseCommaSeparated(tertiaryRaw);
  const titleStr = form.title ?? "";
  const generatedOneLiner = buildOneLiner(titleStr, primary, secondary, tertiary);
  const cleanTitleVal = cleanTitle(titleStr);
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
      const token = await auth.currentUser?.getIdToken();
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
        ...(jobIdFromUrl ? { jobId: jobIdFromUrl } : {}),
      };
      const res = await fetch("/api/jd/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 antialiased transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="pipelines" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-5">
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <a href="/user/pipelines" className="hover:text-gray-900 dark:hover:text-gray-200">Role pipelines</a>
            <ChevronTiny />
            <span className="text-gray-700 dark:text-gray-200 font-medium">{jobIdFromUrl ? "Edit role" : "New role"}</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">
            {jobIdFromUrl ? "Edit Role" : "Review & Confirm"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {jobIdFromUrl ? "Update your role details and settings" : "Review the extracted details and configure your pipeline"}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
            <svg className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="space-y-5">
          {/* Role Details */}
          <SectionCard
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="Role Details"
            desc="Core information about the position"
          >
            <div>
              <label className={LABEL}>Role Title (One-Liner)</label>
              <div className="flex">
                <input
                  type="text"
                  value={form.title || ""}
                  onChange={(e) => update("title", e.target.value)}
                  onFocus={() => setFocusedField("title")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Software Engineer"
                  className={`${FIELD} rounded-r-none flex-1 min-w-0`}
                />
                <div
                  className={`px-3.5 py-2.5 rounded-r-lg border border-l-0 text-sm flex items-center overflow-hidden text-ellipsis min-w-[120px] max-w-[45%] bg-gray-100 dark:bg-white/[0.06] ${
                    focusedField === "title" ? "border-emerald-500" : "border-gray-200 dark:border-white/[0.1]"
                  } ${suffix ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 italic"}`}
                  title={suffix || "Add Primary/Secondary/Tertiary stack below"}
                >
                  {suffix || "(Add stack below)"}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL}>Seniority</label>
                <select
                  className={`${FIELD} cursor-pointer`}
                  value={form.seniority || ""}
                  onChange={(e) => update("seniority", e.target.value)}
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
                <label className={LABEL}>Role Category</label>
                <select
                  className={`${FIELD} cursor-pointer`}
                  value={form.role_category || ""}
                  onChange={(e) => update("role_category", e.target.value)}
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
          </SectionCard>

          {/* Technical Stack */}
          <SectionCard
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            }
            title="Technical Stack"
            desc="Define the technologies and tools required"
          >
            <div>
              <label className={LABEL}>Primary</label>
              <input
                type="text"
                className={FIELD}
                placeholder="e.g. C#/.NET, Python"
                value={primaryRaw}
                onChange={(e) => setPrimaryRaw(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Secondary</label>
              <input
                type="text"
                className={FIELD}
                placeholder="e.g. REST APIs, Redis, Docker"
                value={secondaryRaw}
                onChange={(e) => setSecondaryRaw(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Tertiary</label>
              <input
                type="text"
                className={FIELD}
                placeholder="e.g. Azure DevOps, Git"
                value={tertiaryRaw}
                onChange={(e) => setTertiaryRaw(e.target.value)}
              />
            </div>
            {(primary.length > 0 || secondary.length > 0 || tertiary.length > 0) && (
              <div className="pt-2 border-t border-gray-100 dark:border-white/[0.06]">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Preview</p>
                <div className="space-y-2 text-sm">
                  {primary.length > 0 && (
                    <div className="flex gap-3">
                      <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[80px]">Primary:</span>
                      <span className="text-gray-700 dark:text-gray-300">{primary.join(", ")}</span>
                    </div>
                  )}
                  {secondary.length > 0 && (
                    <div className="flex gap-3">
                      <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[80px]">Secondary:</span>
                      <span className="text-gray-700 dark:text-gray-300">{secondary.join(", ")}</span>
                    </div>
                  )}
                  {tertiary.length > 0 && (
                    <div className="flex gap-3">
                      <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[80px]">Tertiary:</span>
                      <span className="text-gray-700 dark:text-gray-300">{tertiary.join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Work Arrangement */}
          <SectionCard
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="Work Arrangement"
            desc="Location, experience, and employment details"
          >
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL}>Location Type</label>
                <select
                  className={`${FIELD} cursor-pointer`}
                  value={form.location_type || ""}
                  onChange={(e) => update("location_type", e.target.value)}
                >
                  <option value="">Select location</option>
                  {LOCATION_TYPES.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Years of Experience</label>
                <input
                  type="number"
                  min={0}
                  className={FIELD}
                  placeholder="e.g. 3"
                  value={form.yoe_required || ""}
                  onChange={(e) => update("yoe_required", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Employment Type</label>
              <select
                className={`${FIELD} cursor-pointer`}
                value={form.employment_type || ""}
                onChange={(e) => update("employment_type", e.target.value)}
              >
                <option value="">Select type</option>
                {EMPLOYMENT_TYPES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </SectionCard>

          {/* Work Authorization */}
          <SectionCard
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            title="Work Authorization"
            desc="Who can apply, based on where they can work — pick one"
          >
            <div className="space-y-1" role="radiogroup" aria-label="Work authorization requirement">
              {WORK_AUTH_OPTIONS.map((opt) => {
                const selected = workAuthChoice === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 py-1.5 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="work_auth_requirement"
                      className="mt-0.5 w-4 h-4 accent-emerald-600 dark:accent-emerald-500 cursor-pointer focus:ring-2 focus:ring-emerald-500/40"
                      checked={selected}
                      onChange={() => setWorkAuthChoice(opt.value)}
                    />
                    <span className="text-sm">
                      <span
                        className={`block transition-colors ${
                          selected
                            ? "text-gray-900 dark:text-gray-100"
                            : "text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                        }`}
                      >
                        {opt.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {opt.desc}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </SectionCard>

          {/* Pipeline Settings */}
          <SectionCard
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="Pipeline Settings"
            desc="Configure applicant intake limits"
          >
            <div>
              <label className={LABEL}>
                Applicant Limit
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                  (editable anytime from a pipeline&rsquo;s Actions menu, until its shortlist is generated)
                </span>
              </label>
              <input
                ref={submissionCapInputRef}
                type="number"
                min={1}
                className={`${FIELD} ${error ? "border-rose-300 dark:border-rose-700 focus:ring-rose-500/30 focus:border-rose-500" : ""}`}
                placeholder="e.g. 50"
                value={form.submissionCap === undefined || form.submissionCap === "" ? "" : form.submissionCap}
                onChange={(e) => {
                  const v = e.target.value;
                  update("submissionCap", v === "" ? "" : Number(v));
                  if (error) setError(null);
                }}
                onFocus={() => {
                  if (error) setError(null);
                }}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                The intake link closes when the applicant limit is reached. Shortlisting unlocks after at least 60% of the limit is collected.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={() => router.push("/user/dashboard")}
            className="px-5 py-2.5 border border-gray-200 dark:border-white/[0.1] text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-white/[0.04] transition active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={saving}
            className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.98] inline-flex items-center justify-center gap-2"
          >
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

export default function JDConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 dark:border-white/[0.1] border-t-emerald-500 mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse-subtle">Loading…</p>
        </div>
      </div>
    }>
      <JDConfirmContent />
    </Suspense>
  );
}
