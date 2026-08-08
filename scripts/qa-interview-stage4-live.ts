#!/usr/bin/env -S npx tsx
// scripts/qa-interview-stage4-live.ts
//
// LIVE integration QA for Phase 2 STAGE 4 — take-home + system design. Hits REAL
// OpenAI (setup + scoring), REAL GitHub (deterministic repo signal), and REAL
// Firestore, all on THROWAWAY candidates+JDs it creates and deletes (never touches a
// real customer). Mirrors qa-interview-screen-live.ts.
//
// Proves end-to-end: invite-gate (425) → invite (generate + meter) → candidate fetch →
// consent gate (400) → submit → score → scorecard persisted → resubmit refused (409) →
// wrong token 404 → round_disabled 400 → metering decremented once per invite.
//
// PREREQ: .env.local with OPENAI_API_KEY + FIREBASE_SERVICE_ACCOUNT_KEY (+ GitHub App
// creds for a live repo signal; without them the take-home simply scores on the
// walkthrough + probe and flags the missing signal — still a PASS). ~4 LLM calls.
//   npx tsx scripts/qa-interview-stage4-live.ts

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
    console.error("Missing OPENAI_API_KEY (.env.local) — cannot run the live stage-4 QA.");
    process.exit(1);
  }

  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { grantPass, getEntitlementSummary } = await import("@/lib/entitlements");
  const { grantInterviewCredits, interviewCreditsRemaining } = await import("@/lib/interview/interview-credits");
  const { readRounds } = await import("@/lib/interview/rounds");
  const { inviteToTakeHome, getTakeHomeForCandidate, submitTakeHome } = await import("@/lib/interview/takehome-orchestrate");
  const { inviteToSystemDesign, getSystemDesignForCandidate, submitSystemDesign } = await import("@/lib/interview/systemdesign-orchestrate");

  const db = getAdminDb();
  const ts = Date.now();
  const orgId = `qa-org-${ts}`;
  const jobId = `qa-s4-jd-${ts}`;
  const candidateId = `qa-s4-cand-${ts}`;
  const token = `qa-token-${ts}-xyz`;
  // Second throwaway pair to prove round_disabled without disturbing the main flow.
  const jobId2 = `qa-s4-jd2-${ts}`;
  const candidateId2 = `qa-s4-cand2-${ts}`;

  const candRef = db.collection("candidates").doc(candidateId);
  const jdRef = db.collection("jds").doc(jobId);
  const cand2Ref = db.collection("candidates").doc(candidateId2);
  const jd2Ref = db.collection("jds").doc(jobId2);
  const orgRef = db.collection("orgs").doc(orgId);

  try {
    await grantPass(orgId, "team"); // screens — must stay UNTOUCHED
    await grantInterviewCredits(orgId, 10, `grant:${orgId}`); // separate interview-credit balance
    await jdRef.set({
      title: "Senior Backend Engineer",
      seniority: "senior",
      orgId,
      role_fit: { primary: ["Go", "PostgreSQL"], secondary: ["Kafka"] },
      // No recruiter-authored take-home/system-design prompts → both are generated.
    });
    await candRef.set({
      candidateName: "QA Senior Candidate",
      yoe: 7,
      status: "screening",
      accessToken: token,
      matchData: { jobId },
      card: {
        title: "Backend engineer, payments-scale systems",
        edge: "cut checkout p99 latency 40% at a fintech",
        flag: "résumé claims Kafka ownership; work history is light on streaming detail",
      },
      work_history: [{ employer: "FinPay", title: "Senior SWE", scope: "owned the payments ledger + reconciliation" }],
    });

    const screensBefore = (await getEntitlementSummary(orgId)).screensRemaining;
    const credits0 = await interviewCreditsRemaining(orgId);

    // ---------------- TAKE-HOME ----------------
    console.log("take-home invite-gate (candidate can't self-start):");
    const thPre = await getTakeHomeForCandidate(candidateId, token);
    check("not-ready before invite -> 425", thPre.ok === false && thPre.status === 425);

    console.log("take-home invite (generate assignment + probes + meter):");
    const thInv = await inviteToTakeHome(orgId, candidateId);
    check("inviteToTakeHome ok", thInv.ok === true, thInv.ok ? "" : String(thInv.error));
    const afterThInv = readRounds((await candRef.get()).data()).takeHome;
    check("assignment prompt persisted", typeof afterThInv?.prompt === "string" && (afterThInv?.prompt?.length ?? 0) > 0);
    check("reactive probes persisted", (afterThInv?.probe?.questions?.length ?? 0) > 0, `${afterThInv?.probe?.questions?.length}`);
    check("take-home status -> invited", afterThInv?.status === "invited");
    const credits1 = await interviewCreditsRemaining(orgId);
    check("metering: one INTERVIEW CREDIT consumed at take-home invite", credits0 - credits1 === 1, `${credits0} -> ${credits1}`);

    console.log("take-home idempotency (no regen, no double-charge):");
    const thInv2 = await inviteToTakeHome(orgId, candidateId);
    check("re-invite ok + alreadyInvited", thInv2.ok === true && thInv2.alreadyInvited === true);
    check("metering: re-invite does NOT re-charge", (await interviewCreditsRemaining(orgId)) === credits1);

    console.log("take-home fetch + consent gate + submit + score:");
    const thFetch = await getTakeHomeForCandidate(candidateId, token);
    check("getTakeHomeForCandidate ok", thFetch.ok === true);
    check("fetch hides internal 'what good looks like'", thFetch.ok === true && !("whatGoodLooksLike" in (thFetch.assignment as object)));
    const probes = thFetch.ok ? thFetch.probeQuestions : [];
    const probeAnswers = probes.map((p) => ({
      id: p.id,
      text: "I chose an append-only ledger with idempotency keys; I rejected a mutable-balance table because reconciliation needs an audit trail. If scale grew 100× I'd shard by account and move hot reads to a cache, accepting eventual consistency on the read side.",
    }));
    const thNoConsent = await submitTakeHome(candidateId, token, { url: "https://github.com/octocat/Hello-World", walkthrough: "w", answers: probeAnswers }, false);
    check("submit without consent -> 400", thNoConsent.ok === false && thNoConsent.status === 400);
    const thSub = await submitTakeHome(
      candidateId,
      token,
      {
        url: "https://github.com/octocat/Hello-World",
        walkthrough:
          "I built an append-only ledger service in Go. Commits are small and incremental: schema first, then the write path, then idempotency + retries, then tests. The riskiest part is the reconciliation job under concurrent writes; I guard it with a per-account advisory lock.",
        answers: probeAnswers,
      },
      true
    );
    check("submitTakeHome ok (with consent)", thSub.ok === true, thSub.ok ? "" : String(thSub.error));
    const afterThSub = readRounds((await candRef.get()).data()).takeHome;
    check("take-home scorecard persisted", !!afterThSub?.scorecard);
    check("take-home status -> scored", afterThSub?.status === "scored");
    const thOverall = afterThSub?.scorecard?.overall;
    check("take-home overall in 0-100", typeof thOverall === "number" && thOverall >= 0 && thOverall <= 100, `${thOverall}`);
    check("take-home scorecard has dimensions", (afterThSub?.scorecard?.dimensions?.length ?? 0) > 0);
    check("take-home consent recorded", typeof afterThSub?.consent?.acceptedAt === "number" && !!afterThSub?.consent?.noticeVersion);
    check("take-home submission repo url persisted", afterThSub?.submission?.url === "https://github.com/octocat/Hello-World");
    console.log(`    (take-home summary: ${afterThSub?.scorecard?.summary?.slice(0, 140) ?? ""})`);

    console.log("take-home no resubmission:");
    const thResub = await submitTakeHome(candidateId, token, { url: "x", walkthrough: "x", answers: probeAnswers }, true);
    check("resubmit refused (409)", thResub.ok === false && thResub.status === 409);

    // ---------------- SYSTEM DESIGN ----------------
    console.log("system-design invite-gate:");
    const sdPre = await getSystemDesignForCandidate(candidateId, token);
    check("not-ready before invite -> 425", sdPre.ok === false && sdPre.status === 425);

    console.log("system-design invite (generate scenario + meter):");
    const creditsB = await interviewCreditsRemaining(orgId);
    const sdInv = await inviteToSystemDesign(orgId, candidateId);
    check("inviteToSystemDesign ok", sdInv.ok === true, sdInv.ok ? "" : String(sdInv.error));
    const afterSdInv = readRounds((await candRef.get()).data()).systemDesign;
    check("scenario prompt persisted", typeof afterSdInv?.prompt === "string" && (afterSdInv?.prompt?.length ?? 0) > 0);
    check("system-design status -> invited", afterSdInv?.status === "invited");
    check("metering: system-design invite does NOT re-charge (once-per-candidate loop)", creditsB - (await interviewCreditsRemaining(orgId)) === 0);
    check("metering: WHOLE loop cost the candidate ONE interview credit", credits0 - (await interviewCreditsRemaining(orgId)) === 1, `${credits0} -> ${await interviewCreditsRemaining(orgId)}`);
    check("metering: SCREEN wallet UNTOUCHED across the whole loop (separate balances)", (await getEntitlementSummary(orgId)).screensRemaining === screensBefore, `${screensBefore}`);
    console.log(`    (scenario: ${afterSdInv?.prompt?.slice(0, 140) ?? ""})`);

    console.log("system-design fetch + consent gate + submit + score:");
    const sdFetch = await getSystemDesignForCandidate(candidateId, token);
    check("getSystemDesignForCandidate ok", sdFetch.ok === true);
    const sdResponse =
      "Requirements: ~10k writes/s, 100M reads/day, read-heavy. I'd clarify durability + consistency needs first. High level: stateless API tier, a write-optimized primary (append log) fronted by a CDN/cache for reads. Data model: key → target with created_at; I'd pick a KV store (e.g. DynamoDB) for horizontal write scale and tolerate eventual consistency on reads, trading strong consistency for availability and cost. Bottleneck: hot keys — mitigate with cache + request coalescing. Reliability: multi-AZ, async replication, alarms on p99 + error rate.";
    const sdNoConsent = await submitSystemDesign(candidateId, token, sdResponse, false);
    check("submit without consent -> 400", sdNoConsent.ok === false && sdNoConsent.status === 400);
    const sdSub = await submitSystemDesign(candidateId, token, sdResponse, true);
    check("submitSystemDesign ok (with consent)", sdSub.ok === true, sdSub.ok ? "" : String(sdSub.error));
    const afterSdSub = readRounds((await candRef.get()).data()).systemDesign;
    check("system-design scorecard persisted", !!afterSdSub?.scorecard);
    check("system-design status -> scored", afterSdSub?.status === "scored");
    check("system-design has 5-ish dimensions", (afterSdSub?.scorecard?.dimensions?.length ?? 0) >= 4, `${afterSdSub?.scorecard?.dimensions?.length}`);
    check("system-design consent recorded", typeof afterSdSub?.consent?.acceptedAt === "number");
    console.log(`    (system-design summary: ${afterSdSub?.scorecard?.summary?.slice(0, 140) ?? ""})`);

    console.log("system-design no resubmission:");
    const sdResub = await submitSystemDesign(candidateId, token, sdResponse, true);
    check("resubmit refused (409)", sdResub.ok === false && sdResub.status === 409);

    console.log("finalist report compiles from the REAL scored rounds:");
    const { compileFinalistReport } = await import("@/lib/interview/report");
    const report = compileFinalistReport((await candRef.get()).data(), (await jdRef.get()).data());
    check("report compiles take-home + system-design scorecards", report.rounds.takeHome?.scorecard != null && report.rounds.systemDesign != null);
    check("report produces an assistive recommendation", ["advance", "hold", "pass", "incomplete"].includes(report.recommendation.suggested) && report.disclaimer.toLowerCase().includes("human"));
    check("report surfaces the take-home repo url", report.rounds.takeHome?.repoUrl === "https://github.com/octocat/Hello-World");
    console.log(`    (recommendation: ${report.recommendation.suggested} — ${report.recommendation.rationale}; probes: ${report.whatToProbe.length})`);

    // ---------------- SECURITY + GUARDS ----------------
    console.log("token + ownership + round-disabled guards:");
    const badTok = await getTakeHomeForCandidate(candidateId, "wrong-token");
    check("wrong token -> 404", badTok.ok === false && badTok.status === 404);

    await jd2Ref.set({ title: "Backend Engineer", seniority: "junior", orgId, interviewPlan: { takeHome: { enabled: false } } });
    await cand2Ref.set({ candidateName: "QA C2", yoe: 1, status: "screening", accessToken: "t2", matchData: { jobId: jobId2 }, github_metrics: { stars: 3 } });
    const disabled = await inviteToTakeHome(orgId, candidateId2);
    check("round_disabled -> 400 (founder turned the round off)", disabled.ok === false && disabled.status === 400, disabled.ok ? "" : String(disabled.error));
  } finally {
    await candRef.delete().catch(() => {});
    await jdRef.delete().catch(() => {});
    await cand2Ref.delete().catch(() => {});
    await jd2Ref.delete().catch(() => {});
    await orgRef.delete().catch(() => {});
    await db.collection("interviewLedger").doc(`interview:${candidateId}`).delete().catch(() => {});
    await db.collection("interviewLedger").doc(`grant:${orgId}`).delete().catch(() => {});
    await db.collection("orgs").doc(orgId).collection("interviewWallet").doc("balance").delete().catch(() => {});
    console.log("  (cleaned up throwaway candidates + JDs + org + ledger)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
