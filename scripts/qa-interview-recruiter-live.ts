#!/usr/bin/env -S npx tsx
// scripts/qa-interview-recruiter-live.ts
//
// LIVE end-to-end QA for the Phase-2 RECRUITER surface (the web peer of EigenBot):
// exercises the real HTTP routes with a real Firebase ID token — the exact path the
// /user/jd/results/[jobId]/interviews page drives:
//
//   GET  /api/jd/[jobId]/interviews       -> per-candidate `interview` brief + credits
//   POST /api/interview/introcall/[id]    -> stage-2b bookkeeping (done + note)
//   POST /api/interview/invite/[id]       -> round invite + tokenized candidate link
//
// ZERO LLM cost: the seeded JD carries a recruiter-authored systemDesign prompt, so
// the invite resolves the scenario with NO model call (screen/take-home generation is
// covered by qa-interview-screen-live / qa-interview-stage4-live).
//
// Auth: seeds a THROWAWAY Firebase user + org membership, mints a custom token with
// the admin SDK, exchanges it for a real ID token via the Identity Toolkit REST API
// (NEXT_PUBLIC_FIREBASE_API_KEY), and calls the routes with Authorization: Bearer.
// Everything (auth user included) is deleted at the end.
//
// PREREQ: dev server running (npm run dev) with PHASE2_INTERVIEWS_ENABLED=true.
//   npx tsx scripts/qa-interview-recruiter-live.ts
//   npx tsx scripts/qa-interview-recruiter-live.ts --url http://localhost:3000

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function loadEnv(): Promise<void> {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    return;
  } catch {
    /* manual parse */
  }
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const rawLine of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
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

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (ok) pass++;
  else fail++;
}

async function main(): Promise<void> {
  await loadEnv();
  const base = (argVal("--url") ?? "http://localhost:3000").replace(/\/$/, "");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("NEXT_PUBLIC_FIREBASE_API_KEY missing from .env.local — cannot mint an ID token.");
    process.exit(1);
  }

  const { getAdminDb, getAdminAuth } = await import("@/lib/firebase-admin");
  const { grantInterviewCredits } = await import("@/lib/interview/interview-credits");
  const db = getAdminDb();

  const ts = Date.now();
  const uid = `qa-recruiter-${ts}`;
  const orgId = `qa-rec-org-${ts}`;
  const jobId = `qa-rec-jd-${ts}`;
  const candidateId = `qa-rec-cand-${ts}`;
  const candToken = `qa-rec-token-${ts}`;

  // --- Seed: org + membership + userOrgs + JD (with shortlist) + candidate --------
  await db.collection("orgs").doc(orgId).set({ name: "QA Recruiter Org", ownerUserId: uid, plan: "team" });
  await db.collection("orgs").doc(orgId).collection("members").doc(uid).set({ role: "owner", joinedAt: ts });
  await db.collection("userOrgs").doc(uid).set({ orgIds: [orgId], activeOrgId: orgId, updatedAt: ts });
  await db.collection("jds").doc(jobId).set({
    title: "Senior Backend Engineer",
    seniority: "senior",
    orgId,
    createdAt: ts,
    // Recruiter-authored scenario -> inviteToSystemDesign resolves with NO model call.
    interviewPlan: { systemDesign: { enabled: true, prompt: "Design a rate limiter for a public API (QA scenario)." } },
    matchResult: { top20: [{ id: candidateId, candidateName: "QA Recruiter-Flow Candidate", score: 71 }] },
  });
  await db.collection("candidates").doc(candidateId).set({
    candidateName: "QA Recruiter-Flow Candidate",
    yoe: 7,
    score: 71,
    stage: "interviewing",
    selectedForInterview: true,
    accessToken: candToken,
    matchData: { jobId },
    work_history: [{ employer: "FinPay", title: "Senior SWE", scope: "owned the payments ledger" }],
  });
  await grantInterviewCredits(orgId, 10, `grant:${orgId}`);

  // --- Mint a REAL ID token (custom token -> Identity Toolkit exchange) -----------
  const customToken = await getAdminAuth().createCustomToken(uid);
  const exch = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const exchJson = (await exch.json()) as { idToken?: string; error?: { message?: string } };
  if (!exch.ok || !exchJson.idToken) {
    console.error(`Custom-token exchange failed (${exch.status}): ${exchJson.error?.message ?? "unknown"}`);
    process.exit(1);
  }
  const idToken = exchJson.idToken;
  const authed = { Authorization: `Bearer ${idToken}`, "content-type": "application/json" };

  console.log(`\nRecruiter-surface live QA  (base=${base}, org=${orgId})\n`);

  type Brief = {
    planned: string[];
    rounds: {
      introCall: { status: string; note: string | null } | null;
      screen: { status: string } | null;
      takeHome: { status: string } | null;
      systemDesign: { status: string; overall: number | null } | null;
    };
  };
  const getInterviews = async () => {
    const res = await fetch(`${base}/api/jd/${jobId}/interviews`, { headers: authed });
    const json = (await res.json()) as {
      interviewCredits?: number;
      candidates?: Array<{ id: string; interview?: Brief }>;
    };
    return { status: res.status, json };
  };

  // 1. The listing carries the Phase-2 brief + credits.
  let r = await getInterviews();
  let iv = r.json.candidates?.find((c) => c.id === candidateId)?.interview;
  check("GET interviews returns 200 for the org member", r.status === 200, `http=${r.status}`);
  check("payload carries interviewCredits", r.json.interviewCredits === 10, `interviewCredits=${r.json.interviewCredits}`);
  check("candidate carries the interview brief", !!iv);
  check(
    "planned = introCall, screen, takeHome, systemDesign (senior defaults)",
    JSON.stringify(iv?.planned) === JSON.stringify(["introCall", "screen", "takeHome", "systemDesign"]),
    JSON.stringify(iv?.planned)
  );
  check("all rounds start empty", !iv?.rounds.introCall && !iv?.rounds.screen && !iv?.rounds.systemDesign);

  // 2. Intro-call bookkeeping: mark done + note, visible on the next GET.
  let res = await fetch(`${base}/api/interview/introcall/${candidateId}`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ done: true, note: "Great energy on the intro call." }),
  });
  check("introcall mark-done returns 200", res.status === 200, `http=${res.status}`);
  r = await getInterviews();
  iv = r.json.candidates?.find((c) => c.id === candidateId)?.interview;
  check("introCall now passed", iv?.rounds.introCall?.status === "passed", `status=${iv?.rounds.introCall?.status}`);
  check("introCall note persisted", iv?.rounds.introCall?.note === "Great energy on the intro call.");

  res = await fetch(`${base}/api/interview/introcall/${candidateId}`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({}),
  });
  check("empty introcall patch rejected (400)", res.status === 400, `http=${res.status}`);

  // 3. Invite to system design (recruiter prompt -> NO model call) + link shape.
  res = await fetch(`${base}/api/interview/invite/${candidateId}`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ round: "systemDesign" }),
  });
  let inv = (await res.json()) as { ok?: boolean; alreadyInvited?: boolean; link?: string };
  check("invite returns 200 ok", res.status === 200 && inv.ok === true, `http=${res.status}`);
  check("first invite is not alreadyInvited", inv.alreadyInvited === false);
  check(
    "link is the tokenized candidate URL",
    typeof inv.link === "string" && inv.link.includes(`/interview/${candidateId}/systemdesign?t=`),
    inv.link ?? "(none)"
  );

  // 4. Idempotency over HTTP: same invite again -> alreadyInvited, same link, no recharge.
  const firstLink = inv.link;
  res = await fetch(`${base}/api/interview/invite/${candidateId}`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ round: "systemDesign" }),
  });
  inv = (await res.json()) as { ok?: boolean; alreadyInvited?: boolean; link?: string };
  check("re-invite reports alreadyInvited", res.status === 200 && inv.alreadyInvited === true);
  check("re-invite returns the same link", inv.link === firstLink);

  // 5. Metering + status visible in the UI payload: 1 credit consumed, round invited.
  r = await getInterviews();
  iv = r.json.candidates?.find((c) => c.id === candidateId)?.interview;
  check("credit consumed once (10 -> 9)", r.json.interviewCredits === 9, `interviewCredits=${r.json.interviewCredits}`);
  check("systemDesign now invited", iv?.rounds.systemDesign?.status === "invited", `status=${iv?.rounds.systemDesign?.status}`);

  // 6. Guardrails: invalid round; unauthenticated -> 401.
  res = await fetch(`${base}/api/interview/invite/${candidateId}`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ round: "nope" }),
  });
  check("invalid round rejected (400)", res.status === 400, `http=${res.status}`);
  res = await fetch(`${base}/api/interview/invite/${candidateId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ round: "screen" }),
  });
  check("unauthenticated invite rejected (401)", res.status === 401, `http=${res.status}`);

  // --- Cleanup (throwaway everything, auth user included) -------------------------
  await db.collection("candidates").doc(candidateId).delete();
  await db.collection("jds").doc(jobId).delete();
  await db.collection("interviewLedger").doc(`interview:${candidateId}`).delete().catch(() => {});
  await db.collection("interviewLedger").doc(`grant:${orgId}`).delete().catch(() => {});
  await db.collection("orgs").doc(orgId).collection("interviewWallet").doc("balance").delete().catch(() => {});
  await db.collection("orgs").doc(orgId).collection("members").doc(uid).delete().catch(() => {});
  await db.collection("orgs").doc(orgId).delete().catch(() => {});
  await db.collection("userOrgs").doc(uid).delete().catch(() => {});
  await getAdminAuth().deleteUser(uid).catch(() => {});
  console.log("\n  cleanup: throwaway org/jd/candidate/user deleted");

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
