/**
 * Canonical option sets for the three JD fields a recruiter PICKS (not free text):
 * work authorization, location type, employment type. SINGLE SOURCE OF TRUTH —
 * both the web confirm page (app/user/jd/confirm/page.tsx) and the Slack intake
 * flow (lib/agent/loop.ts) import these, so the choices a recruiter sees on the
 * web and the choices EigenBot offers in Slack can never drift apart.
 *
 * Work authorization is a single mutually-exclusive choice, not independent flags:
 * sponsoring overrides any region requirement, and "not required" contradicts
 * requiring one. Each choice maps to exactly one of the three persisted booleans
 * (or none), so matching (lib/match.ts workAuthMatch) is unchanged.
 */
export type WorkAuthChoice = "none" | "us" | "eu" | "sponsor";

export const WORK_AUTH_OPTIONS: { value: WorkAuthChoice; title: string; desc: string }[] = [
  {
    value: "none",
    title: "No work authorization required",
    desc: "Open to anyone, regardless of location — best for fully remote roles.",
  },
  {
    value: "us",
    title: "Must already be authorized to work in the US",
    desc: "Candidates without US authorization won't be matched.",
  },
  {
    value: "eu",
    title: "Must already be authorized to work in the EU",
    desc: "Candidates without EU authorization won't be matched.",
  },
  {
    value: "sponsor",
    title: "We sponsor work authorization",
    desc: "We'll handle the visa or sponsorship — open to candidates who need it, regardless of location.",
  },
];

export const LOCATION_TYPES = ["Remote", "Hybrid", "On-site"] as const;
export const EMPLOYMENT_TYPES = ["Full-time", "Intern", "Contract"] as const;

/** Expand a chosen work-auth option into the three persisted booleans (exactly
 *  one true, or all false for "none"). */
export function workAuthChoiceToBooleans(choice: WorkAuthChoice): {
  work_auth_us_required: boolean;
  work_auth_eu_required: boolean;
  work_auth_provided: boolean;
} {
  return {
    work_auth_us_required: choice === "us",
    work_auth_eu_required: choice === "eu",
    work_auth_provided: choice === "sponsor",
  };
}

/** Collapse the three persisted booleans back into the single active choice.
 *  Legacy JDs with both us+eu set surface as "us" — a near-impossible AND. */
export function workAuthBooleansToChoice(b: {
  work_auth_us_required?: boolean;
  work_auth_eu_required?: boolean;
  work_auth_provided?: boolean;
}): WorkAuthChoice {
  if (b.work_auth_provided) return "sponsor";
  if (b.work_auth_us_required) return "us";
  if (b.work_auth_eu_required) return "eu";
  return "none";
}
