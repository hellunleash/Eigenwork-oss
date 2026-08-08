#!/usr/bin/env -S npx tsx
// scripts/qa-seed-screen.ts
//
// Seeds a THROWAWAY JD + candidate so the stage-3 candidate page can be opened in a
// browser against the dev server. Prints the local URL. Does NOT delete (so you can
// browse it); pass --cleanup <candidateId> <jobId> to remove afterwards.
//
//   npx tsx scripts/qa-seed-screen.ts                 # seed, print URL
//   npx tsx scripts/qa-seed-screen.ts --senior        # seed a senior (no-GitHub) candidate
//   npx tsx scripts/qa-seed-screen.ts --cleanup <candId> <jobId>
//
// Reads .env.local (FIREBASE_SERVICE_ACCOUNT_KEY + project id). No LLM call here —
// questions generate lazily on first page open.

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

async function main(): Promise<void> {
  await loadEnv();
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const db = getAdminDb();
  const args = process.argv.slice(2);

  if (args[0] === "--cleanup") {
    const [, candId, jobId, orgId] = args;
    if (candId) {
      await db.collection("candidates").doc(candId).delete();
      await db.collection("interviewLedger").doc(`interview:${candId}`).delete().catch(() => {});
    }
    if (jobId) await db.collection("jds").doc(jobId).delete();
    if (orgId) {
      await db.collection("interviewLedger").doc(`grant:${orgId}`).delete().catch(() => {});
      await db.collection("orgs").doc(orgId).collection("interviewWallet").doc("balance").delete().catch(() => {});
      await db.collection("orgs").doc(orgId).delete().catch(() => {});
    }
    console.log(`Deleted candidate=${candId ?? "-"} jd=${jobId ?? "-"} org=${orgId ?? "-"}`);
    return;
  }

  if (args[0] === "--show") {
    const candId = args[1];
    const { readRounds } = await import("@/lib/interview/rounds");
    const data = (await db.collection("candidates").doc(candId).get()).data();
    const screen = readRounds(data).screen;
    console.log(`status: ${screen?.status}`);
    console.log(`questions: ${screen?.questions?.length ?? 0}, answers: ${screen?.answers?.length ?? 0}`);
    for (const q of screen?.questions ?? []) console.log(`  [${q.kind}] ${q.prompt}`);
    const sc = screen?.scorecard;
    if (sc) {
      console.log(`scorecard.overall: ${sc.overall}`);
      console.log(`scorecard.suggestedAdvance: ${sc.suggestedAdvance}`);
      console.log(`dimensions: ${sc.dimensions.map((d) => `${d.name}=${d.score}`).join(", ")}`);
      if (sc.flags?.length) console.log(`flags: ${sc.flags.join(" | ")}`);
      console.log(`summary: ${sc.summary}`);
    } else {
      console.log("scorecard: (none)");
    }
    return;
  }

  const senior = args.includes("--senior");
  const ts = Date.now();
  const orgId = `qa-org-${ts}`;
  const jobId = `qa-screen-jd-${ts}`;
  const candidateId = `qa-screen-cand-${ts}`;
  const token = `qa-token-${ts}`;
  const base = process.env.QA_BASE_URL || "http://localhost:3000";

  await db.collection("jds").doc(jobId).set({
    title: senior ? "Senior Backend Engineer" : "Backend Engineer",
    seniority: senior ? "senior" : "junior",
    orgId,
    role_category: "backend",
    yoe_required: senior ? "5+" : "0-2",
    tech_stack: ["Go", "PostgreSQL", "Kafka", "gRPC"],
    role_fit: {
      title: "Backend Engineer",
      primary: ["Go", "PostgreSQL"],
      secondary: ["Kafka"],
      tertiary: ["Redis"],
      one_liner: "Builds reliable payment-scale backend services",
    },
  });
  await db.collection("candidates").doc(candidateId).set({
    candidateName: senior ? "QA Senior Candidate" : "QA Junior Candidate",
    yoe: senior ? 7 : 1,
    status: "screening",
    accessToken: token,
    matchData: { jobId },
    card: {
      title: "Backend engineer",
      edge: "cut checkout p99 latency 40%",
      flag: "résumé claims Kafka ownership; history light on streaming detail",
    },
    ...(senior
      ? { work_history: [{ employer: "FinPay", title: "Senior SWE", scope: "owned the payments ledger" }] }
      : {
          github_metrics: { stars: 14, primaryLang: "Go", repos: 8 },
          // A junior still has claimed work — it now grounds the junior screen too.
          work_history: [{ employer: "DataStart (internship)", title: "SWE Intern", scope: "built an internal metrics dashboard + a Kafka consumer" }],
        }),
  });

  // Grant the throwaway org screens, then invite ALL THREE app-run rounds
  // (generate-on-invite) so each candidate page loads instantly.
  const { grantInterviewCredits } = await import("@/lib/interview/interview-credits");
  const { inviteToScreen } = await import("@/lib/interview/screen-orchestrate");
  const { inviteToTakeHome } = await import("@/lib/interview/takehome-orchestrate");
  const { inviteToSystemDesign } = await import("@/lib/interview/systemdesign-orchestrate");
  await grantInterviewCredits(orgId, 10, `grant:${orgId}`);

  const inv = await inviteToScreen(orgId, candidateId);
  if (!inv.ok) {
    console.error(`screen invite failed: ${inv.error} (status ${inv.status})`);
    process.exit(1);
  }
  const th = await inviteToTakeHome(orgId, candidateId);
  if (!th.ok) console.warn(`take-home invite failed: ${th.error} (status ${th.status})`);
  const sd = await inviteToSystemDesign(orgId, candidateId);
  if (!sd.ok) console.warn(`system-design invite failed: ${sd.error} (status ${sd.status})`);

  console.log("Seeded + invited throwaway interview candidate:");
  console.log(`  candidateId: ${candidateId}`);
  console.log(`  jobId:       ${jobId}`);
  console.log(`  orgId:       ${orgId}`);
  console.log(`  track:       ${senior ? "senior (no GitHub)" : "junior"}`);
  console.log("");
  console.log(`  SCREEN:        ${base}/interview/${candidateId}?t=${token}`);
  console.log(`  TAKE-HOME:     ${base}/interview/${candidateId}/takehome?t=${token}`);
  console.log(`  SYSTEM DESIGN: ${base}/interview/${candidateId}/systemdesign?t=${token}`);
  console.log("");
  console.log(`  cleanup:  npx tsx scripts/qa-seed-screen.ts --cleanup ${candidateId} ${jobId} ${orgId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
