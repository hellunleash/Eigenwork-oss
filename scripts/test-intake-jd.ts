#!/usr/bin/env -S npx tsx
// scripts/test-intake-jd.ts — verify a Slack-minted intake JD is now COMPLETE
// (role_fit.one_liner + anchors + work_auth) so /api/jd/match can score it, and
// that "how many roles" routes to list_roles (not help). Read-only: it parses +
// builds the role_fit WITHOUT calling createJd (no junk role written).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    /* manual */
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

async function main(): Promise<void> {
  await loadEnv();
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes('"agent.gemini_usage"')) return;
    orig(...a);
  };

  const { parseJdText } = await import("@/lib/jd-parse");
  const { buildOneLiner, cleanTitle } = await import("@/lib/jd-role-fit");
  const { routeMessage } = await import("@/lib/agent/router");
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { listJobs, getOrgCandidateRoster } = await import("@/lib/agent/data");

  // --- 1. The JD a bot intake would mint ---
  const request = "create an intake link for a senior backend engineer with Go, Postgres and Kubernetes, remote, full-time";
  const parsed = await parseJdText(request);
  const title = parsed.title || "New role";
  const roleFit = {
    title: cleanTitle(title),
    primary: parsed.primary,
    secondary: parsed.secondary,
    tertiary: parsed.tertiary,
    one_liner: buildOneLiner(title, parsed.primary, parsed.secondary, parsed.tertiary),
  };
  orig("\n=== Slack-minted JD (would be saved) ===");
  orig(JSON.stringify({ title, seniority: parsed.seniority, role_category: parsed.role_category, tech_stack: parsed.tech_stack, location_type: parsed.location_type, employment_type: parsed.employment_type, role_fit: roleFit, work_auth_requirement: { us_required: false, eu_required: false, provided: false } }, null, 2));
  orig(`\nmatch-critical fields present?  one_liner: ${roleFit.one_liner ? "YES" : "NO"}  ·  anchors: ${roleFit.primary.length + roleFit.secondary.length + roleFit.tertiary.length}  ·  work_auth: YES`);

  // --- 2. routing: roles vs candidates ---
  const inst = (await getAdminDb().collection("slack_installations").limit(1).get()).docs[0].data() as Record<string, unknown>;
  const orgId = inst.orgId as string;
  const [jobs, roster] = await Promise.all([listJobs(orgId), getOrgCandidateRoster(orgId)]);
  orig("\n=== Routing ===");
  for (const q of ["how many roles in my role pipeline ?", "list my roles", "best candidate in software engineering role ?"]) {
    const r = await routeMessage(q, jobs, roster);
    orig(`"${q}"  ->  intent=${r.intent}${r.jobId ? ` jobId=${r.jobId}` : ""}`);
  }
  console.log = orig;
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
