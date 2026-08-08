#!/usr/bin/env -S npx tsx
// scripts/qa-interview-screen-live.ts
//
// LIVE integration QA for the Phase 2 stage-3 screen orchestration. Unlike the
// pure qa:interview, this hits REAL OpenAI (question generation + scoring) and REAL
// Firestore — on a THROWAWAY candidate+JD it creates and deletes, so it never
// touches a real customer. Mirrors verify-paddle-credit.ts (throwaway target, reads
// .env.local for creds).
//
// Proves the core mechanic end-to-end: seed a SENIOR candidate (yoe>2, no GitHub) →
// getOrGenerateScreen generates + persists questions → submitScreen persists answers,
// scores, persists the scorecard → token mismatch is 404 → resubmit is refused.
//
// PREREQ: .env.local with OPENAI_API_KEY + FIREBASE_SERVICE_ACCOUNT_KEY +
// NEXT_PUBLIC_FIREBASE_PROJECT_ID (same as the dev server). Run:
//   npx tsx scripts/qa-interview-screen-live.ts
// Makes 2 LLM calls (~cents). Exits non-zero on any failed check.

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

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (ok) pass++;
  else fail++;
}

async function main(): Promise<void> {
  await loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY (.env.local) — cannot run the live screen QA.");
    process.exit(1);
  }

  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { inviteToScreen, getScreenForCandidate, submitScreen } = await import("@/lib/interview/screen-orchestrate");
  const { readRounds } = await import("@/lib/interview/rounds");
  const { grantPass, getEntitlementSummary } = await import("@/lib/entitlements");
  const { grantInterviewCredits, interviewCreditsRemaining } = await import("@/lib/interview/interview-credits");

  const db = getAdminDb();
  const ts = Date.now();
  const orgId = `qa-org-${ts}`;
  const jobId = `qa-screen-jd-${ts}`;
  const candidateId = `qa-screen-cand-${ts}`;
  const token = `qa-token-${ts}-abc`;
  const candRef = db.collection("candidates").doc(candidateId);
  const jdRef = db.collection("jds").doc(jobId);
  const orgRef = db.collection("orgs").doc(orgId);

  try {
    await grantPass(orgId, "team"); // screens — must stay UNTOUCHED by interview metering
    await grantInterviewCredits(orgId, 10, `grant:${orgId}`); // the SEPARATE interview-credit balance
    await jdRef.set({
      title: "Senior Backend Engineer",
      seniority: "senior",
      orgId,
      role_fit: { primary: ["Go", "PostgreSQL"], secondary: ["Kafka", "gRPC"] },
    });
    await candRef.set({
      candidateName: "QA Senior Candidate",
      yoe: 7, // senior => no GitHub grounding
      status: "screening",
      accessToken: token,
      matchData: { jobId },
      card: {
        title: "Backend engineer, payments-scale systems",
        edge: "cut checkout p99 latency 40% at a fintech",
        flag: "résumé claims Kafka ownership; work history is light on streaming detail",
      },
      work_history: [
        { employer: "FinPay", title: "Senior SWE", scope: "owned the payments ledger + reconciliation" },
      ],
    });

    console.log("invite-gate (before invite, candidate can't self-start):");
    const preInvite = await getScreenForCandidate(candidateId, token);
    check("not-ready before invite -> 425", preInvite.ok === false && preInvite.status === 425);

    console.log("invite (recruiter/org-scoped: generate + meter):");
    const screensBefore = (await getEntitlementSummary(orgId)).screensRemaining;
    const creditsBefore = await interviewCreditsRemaining(orgId);
    const inv = await inviteToScreen(orgId, candidateId);
    check("inviteToScreen ok", inv.ok === true, inv.ok ? "" : String(inv.error));
    const afterGen = readRounds((await candRef.get()).data());
    check("questions persisted under interviewRounds.screen", Array.isArray(afterGen.screen?.questions) && (afterGen.screen?.questions?.length ?? 0) > 0);
    check("screen status -> invited", afterGen.screen?.status === "invited");
    check("returns 5 questions (default plan)", (afterGen.screen?.questions?.length ?? 0) === 5, `${afterGen.screen?.questions?.length}`);
    check(
      "has coding + probe questions",
      (afterGen.screen?.questions ?? []).some((q) => q.kind === "code") && (afterGen.screen?.questions ?? []).some((q) => q.kind === "probe")
    );
    const creditsAfter = await interviewCreditsRemaining(orgId);
    check("metering: one INTERVIEW CREDIT consumed at invite", creditsBefore - creditsAfter === 1, `${creditsBefore} -> ${creditsAfter}`);
    check("metering: the SCREEN wallet is UNTOUCHED (separate balances)", (await getEntitlementSummary(orgId)).screensRemaining === screensBefore, `${screensBefore}`);

    console.log("invite idempotency (no regen, no double-charge):");
    const inv2 = await inviteToScreen(orgId, candidateId);
    check("re-invite ok + alreadyInvited", inv2.ok === true && inv2.alreadyInvited === true);
    check("metering: re-invite does NOT re-charge", (await interviewCreditsRemaining(orgId)) === creditsAfter, `${creditsAfter}`);

    console.log("candidate fetch + token gate:");
    const fetchOk = await getScreenForCandidate(candidateId, token);
    check("getScreenForCandidate ok", fetchOk.ok === true);
    const badTok = await getScreenForCandidate(candidateId, "wrong-token");
    check("wrong token -> 404", badTok.ok === false && badTok.status === 404);

    console.log("consent gate + submit + score-on-submit:");
    const questions = afterGen.screen?.questions ?? [];
    const answers = questions.map((q) => ({
      id: q.id,
      text: "I'd approach it by isolating the bottleneck, benchmarking, and choosing the simplest change that holds under load; here's the reasoning...",
    }));
    const noConsent = await submitScreen(candidateId, token, answers, false);
    check("submit without consent -> 400", noConsent.ok === false && noConsent.status === 400);
    const sub = await submitScreen(candidateId, token, answers, true);
    check("submitScreen ok (with consent)", sub.ok === true, sub.ok ? "" : String(sub.error));
    const afterSub = readRounds((await candRef.get()).data());
    check("scorecard persisted", !!afterSub.screen?.scorecard);
    check("screen status -> scored", afterSub.screen?.status === "scored");
    const overall = afterSub.screen?.scorecard?.overall;
    check("overall score in 0-100", typeof overall === "number" && overall >= 0 && overall <= 100, `${overall}`);
    check("scorecard has dimensions", (afterSub.screen?.scorecard?.dimensions?.length ?? 0) > 0);
    check("suggestedAdvance is a boolean (recommendation only)", typeof afterSub.screen?.scorecard?.suggestedAdvance === "boolean");
    check("consent recorded with notice version", typeof afterSub.screen?.consent?.acceptedAt === "number" && !!afterSub.screen?.consent?.noticeVersion);

    console.log("no resubmission:");
    const resub = await submitScreen(candidateId, token, answers, true);
    check("resubmit refused (409)", resub.ok === false && resub.status === 409);
  } finally {
    await candRef.delete().catch(() => {});
    await jdRef.delete().catch(() => {});
    await orgRef.delete().catch(() => {});
    await db.collection("interviewLedger").doc(`interview:${candidateId}`).delete().catch(() => {});
    await db.collection("interviewLedger").doc(`grant:${orgId}`).delete().catch(() => {});
    await db.collection("orgs").doc(orgId).collection("interviewWallet").doc("balance").delete().catch(() => {});
    console.log("  (cleaned up throwaway candidate + JD + org)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
