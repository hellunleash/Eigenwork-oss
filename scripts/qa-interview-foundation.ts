#!/usr/bin/env -S npx tsx
// scripts/qa-interview-foundation.ts
//
// QA for the Phase 2 interview FOUNDATION (docs/phase2-plan.md). PURE LOGIC — no
// Firestore, no network, no prod risk. Verifies the canonical round schema (critic
// blocker 1z) and the interviewPlan defaults + PARTIAL-SAFE plan-update builder
// (critic blocker 1y).
//
// Run:  npx tsx scripts/qa-interview-foundation.ts   (or: npm run qa:interview)
// Exits non-zero if any check fails.

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (ok) pass++;
  else fail++;
}

async function main(): Promise<void> {
  const { defaultInterviewPlan, buildInterviewPlanUpdate, plannedAppRounds } = await import("@/lib/interview/plan");
  const { ROUND_ROOT, readRounds, roundPath } = await import("@/lib/interview/rounds");

  console.log("interviewPlan defaults (customizable rounds; senior/junior split):");
  const senior = defaultInterviewPlan(true);
  const junior = defaultInterviewPlan(false);
  check("senior system-design ON by default", senior.systemDesign.enabled === true);
  check("junior system-design OFF by default", junior.systemDesign.enabled === false);
  check("screen defaults to 5 questions", senior.screen.questionCount === 5);
  check(
    "screen count = code + probe",
    senior.screen.questionCount === senior.screen.codeCount + senior.screen.probeCount,
    `${senior.screen.codeCount} code + ${senior.screen.probeCount} probe`
  );
  check("senior round set includes systemDesign", senior.rounds.includes("systemDesign"));
  check("junior round set excludes systemDesign", !junior.rounds.includes("systemDesign"));
  check("take-home inconsistency flag OFF by default", senior.takeHome.inconsistencyFlag === false);

  console.log("plannedAppRounds (ONE home for 'which rounds count' — report + progress UI):");
  check(
    "senior default -> screen, takeHome, systemDesign in plan order",
    JSON.stringify(plannedAppRounds(senior)) === JSON.stringify(["screen", "takeHome", "systemDesign"])
  );
  check(
    "junior default -> screen, takeHome (no systemDesign)",
    JSON.stringify(plannedAppRounds(junior)) === JSON.stringify(["screen", "takeHome"])
  );
  check(
    "disabled takeHome is excluded even when planned",
    JSON.stringify(plannedAppRounds({ ...senior, takeHome: { ...senior.takeHome, enabled: false } })) ===
      JSON.stringify(["screen", "systemDesign"])
  );
  check(
    "systemDesign enabled but NOT in rounds -> excluded (rounds list wins)",
    JSON.stringify(plannedAppRounds({ ...junior, systemDesign: { enabled: true } })) === JSON.stringify(["screen", "takeHome"])
  );

  console.log("partial-safe interviewPlan update (critic blocker 1y — no sibling clobber):");
  const upd = buildInterviewPlanUpdate({ takeHome: { enabled: true, prompt: "Build a rate limiter" } });
  check("uses dot-path keys", Object.keys(upd).every((k) => k.startsWith("interviewPlan.")), Object.keys(upd).join(", "));
  check("NO bare `interviewPlan` key (would clobber siblings)", !("interviewPlan" in upd));
  check("only the supplied sub-key is written", Object.keys(upd).length === 1 && "interviewPlan.takeHome" in upd);
  const updMixed = buildInterviewPlanUpdate({ screen: undefined, systemDesign: { enabled: true } });
  check(
    "drops undefined sub-keys, keeps defined",
    !("interviewPlan.screen" in updMixed) && "interviewPlan.systemDesign" in updMixed
  );
  check("empty partial -> empty update", Object.keys(buildInterviewPlanUpdate({})).length === 0);

  console.log("canonical round schema (critic blocker 1z — one path everyone imports):");
  check("ROUND_ROOT is the single constant", ROUND_ROOT === "interviewRounds", ROUND_ROOT);
  check(
    "roundPath composes the canonical dotted path",
    roundPath("screen", "scorecard") === "interviewRounds.screen.scorecard",
    roundPath("screen", "scorecard")
  );
  check("readRounds on empty doc -> {}", JSON.stringify(readRounds({})) === "{}");
  check("readRounds on null -> {}", JSON.stringify(readRounds(null)) === "{}");
  const doc = { [ROUND_ROOT]: { screen: { status: "scored" as const } } };
  check("readRounds returns the rounds object", readRounds(doc).screen?.status === "scored");

  console.log("round writer (dot-path, no sibling-round clobber):");
  const { buildRoundUpdate } = await import("@/lib/interview/round-writer");
  const ru = buildRoundUpdate("screen", { status: "invited", invitedAt: 123, nope: undefined });
  check("round update uses ROUND_ROOT dot-paths", Object.keys(ru).every((k) => k.startsWith(`${ROUND_ROOT}.screen.`)), Object.keys(ru).join(", "));
  check("round update drops undefined", !("interviewRounds.screen.nope" in ru));
  check("no bare round key (no sibling-round clobber)", !(ROUND_ROOT in ru) && !(`${ROUND_ROOT}.screen` in ru));

  console.log("stage-3 screen generator (seniority-branched grounding):");
  const { buildScreenGenPrompt, normalizeScreenQuestions, normalizeScreenScorecard, buildScreenScorePrompt } = await import("@/lib/interview/screen");
  const screenCfg = { questionCount: 5, codeCount: 2, probeCount: 3, difficulty: "medium" as const };
  const baseGen = { candidateName: "A", roleTitle: "Backend Eng", screen: screenCfg, card: { flag: "resume claims Kafka; signal weak" } };
  const seniorPrompt = buildScreenGenPrompt({ ...baseGen, senior: true, workHistory: [{ employer: "Acme", scope: "payments" }], roleRequirements: "seniority: senior\nmust-have skills: Elixir" });
  const juniorPrompt = buildScreenGenPrompt({ ...baseGen, senior: false, githubMetrics: { stars: 12 }, workHistory: [{ employer: "Beta", scope: "intern" }] });
  check("senior prompt has WORK HISTORY grounding", seniorPrompt.includes("WORK HISTORY"));
  check("senior prompt has NO GITHUB SIGNAL block (yoe>2 = no repo)", !seniorPrompt.includes("GITHUB SIGNAL"));
  check("junior prompt has GITHUB SIGNAL grounding", juniorPrompt.includes("GITHUB SIGNAL"));
  check("junior prompt ALSO carries WORK HISTORY (send it on the junior route too)", juniorPrompt.includes("WORK HISTORY"));
  check("prompt carries ROLE REQUIREMENTS block", seniorPrompt.includes("ROLE REQUIREMENTS") && seniorPrompt.includes("Elixir"));
  const reasoningPrompt = buildScreenGenPrompt({ ...baseGen, senior: true, workHistory: [], etiReasoning: "ASSESSMENT NOTES:\n- deep ownership shown" });
  check("prompt carries ETI ASSESSMENT block when reasoning present", reasoningPrompt.includes("ETI ASSESSMENT") && reasoningPrompt.includes("deep ownership"));
  check("both fence untrusted input", seniorPrompt.includes("UNTRUSTED") && juniorPrompt.includes("UNTRUSTED"));
  check("probes press on the flag when present", seniorPrompt.includes("FLAG (press on this)"));

  console.log("stage-3 screen normalizers (pure):");
  const qs = normalizeScreenQuestions(
    { questions: [
      { kind: "code", prompt: "c1" }, { kind: "code", prompt: "c2" }, { kind: "code", prompt: "c3 extra" },
      { kind: "probe", prompt: "p1" }, { kind: "probe", prompt: "p2" }, { kind: "probe", prompt: "p3" }, { kind: "probe", prompt: "p4 extra" },
    ] },
    screenCfg
  );
  check("enforces codeCount code questions", qs.filter((q) => q.kind === "code").length === 2);
  check("enforces probeCount probe questions", qs.filter((q) => q.kind === "probe").length === 3);
  check("questions get stable ids", qs[0]?.id === "q1" && qs[qs.length - 1]?.id === `q${qs.length}`);
  const scHigh = normalizeScreenScorecard({ overall: 85, dimensions: [{ name: "x", score: 90, max: 100, note: "n" }], summary: "s" }, 60);
  const scLow = normalizeScreenScorecard({ overall: 40, dimensions: [], summary: "s" }, 60);
  check("suggestedAdvance TRUE when overall >= threshold", scHigh.suggestedAdvance === true);
  check("suggestedAdvance FALSE when overall < threshold", scLow.suggestedAdvance === false);
  check("scorecard clamps overall to 0-100", normalizeScreenScorecard({ overall: 250, dimensions: [] }, 60).overall === 100);
  const screenScorePrompt = buildScreenScorePrompt({ roleTitle: "R", senior: true, questions: qs, answers: [{ id: "q1", text: "ans" }] });
  check("score prompt fences answers", screenScorePrompt.includes("UNTRUSTED"));
  check("score prompt has scoring-integrity guard (weights + anti-injection)", screenScorePrompt.includes("SCORING INTEGRITY"));
  const { boundedJson } = await import("@/lib/interview/prompt-util");
  check("boundedJson caps oversized blobs", boundedJson("x".repeat(5000), 100).length <= 120 && boundedJson([1, 2, 3]).includes("2"));
  check("normalizeScreenQuestions treats 'coding' kind as code (not probe)", normalizeScreenQuestions({ questions: [{ kind: "coding", prompt: "c1" }, { kind: "Code", prompt: "c2" }, { kind: "probe", prompt: "p1" }] }, screenCfg).filter((q) => q.kind === "code").length === 2);

  console.log("screen context builder (yoe>2 grounding split — pure):");
  const { buildScreenGenContext, resolveInterviewPlan, isSeniorTrack } = await import("@/lib/interview/context");
  const jd = { title: "Backend Eng", seniority: "senior", role_fit: { primary: ["Go", "Postgres"], secondary: ["Kafka"] } };
  const seniorCand = { candidateName: "S", yoe: 6, work_history: [{ employer: "Acme" }], github_metrics: { stars: 9 }, card: { flag: "f" } };
  const juniorCand = { candidateName: "J", yoe: 1, work_history: [{ employer: "X" }], github_metrics: { stars: 3 } };
  check("yoe>2 => senior track", isSeniorTrack(seniorCand, jd) === true);
  check("yoe<=2 => junior track", isSeniorTrack(juniorCand, jd) === false);
  check("no yoe => falls back to seniority string", isSeniorTrack({}, jd) === true);
  const planS = resolveInterviewPlan(jd, true);
  const senCtx = buildScreenGenContext(seniorCand, jd, planS);
  const junCtx = buildScreenGenContext(juniorCand, jd, resolveInterviewPlan(jd, false));
  check("senior ctx carries work_history", senCtx.workHistory !== undefined);
  check("senior ctx has NO github_metrics (yoe>2 = no repo)", senCtx.githubMetrics === undefined);
  check("junior ctx carries github_metrics", junCtx.githubMetrics !== undefined);
  check("junior ctx ALSO carries work_history (send it on the junior route too)", junCtx.workHistory !== undefined);
  check("context extracts role skills", (senCtx.roleSkills ?? []).includes("Go"));
  check("context builds ROLE REQUIREMENTS from JD", (senCtx.roleRequirements ?? "").includes("seniority") && (senCtx.roleRequirements ?? "").includes("Go"));
  const reasonCand = { candidateName: "S", yoe: 6, work_history: [{ employer: "Acme" }], card: { flag: "f" }, breakdown: { OM: { OM: 80, justification: "clear ownership of the ledger rewrite" }, OD: { OD: 60, justification: "some depth gaps under load" } }, overlord_verdict: { verdict: "authentic", fraud_risk: "low", triggered: ["kafka claim thin vs history"] } };
  const reasonCtx = buildScreenGenContext(reasonCand, jd, planS);
  check("context composes ETI reasoning (block justifications + overlord)", (reasonCtx.etiReasoning ?? "").includes("ownership of the ledger") && (reasonCtx.etiReasoning ?? "").includes("kafka claim thin"));
  check("ETI reasoning also sends the card (send BOTH, not either/or)", reasonCtx.card?.flag === "f");
  check("stored interviewPlan partial merges over defaults", resolveInterviewPlan({ interviewPlan: { screen: { questionCount: 3, codeCount: 1, probeCount: 2, difficulty: "hard" } } }, true).screen.questionCount === 3);

  console.log("shared scorecard normalizer (one path for every round — reuse-never-fork):");
  const { normalizeScorecard, clamp100 } = await import("@/lib/interview/scorecard");
  check("clamp100 clamps above 100", clamp100(150) === 100);
  check("clamp100 floors non-finite to 0", clamp100("x") === 0);
  const shared = normalizeScorecard({ overall: 72, dimensions: [{ name: "d", score: 200, max: 100, note: "n" }], summary: "s", flags: ["x"] }, 60);
  check("normalizeScorecard clamps dimension score", shared.dimensions[0].score === 100);
  check("normalizeScorecard suggestedAdvance from threshold", shared.suggestedAdvance === true);
  check("normalizeScorecard keeps flags", (shared.flags ?? []).includes("x"));

  console.log("stage-4 take-home (code + THINKING; heuristics over comments):");
  const { buildTakeHomeSetupPrompt, normalizeTakeHomeSetup, buildTakeHomeScorePrompt, normalizeTakeHomeScorecard, TAKEHOME_PROBE_COUNT } =
    await import("@/lib/interview/takehome");
  const thGen = buildTakeHomeSetupPrompt({ roleTitle: "Backend Eng", senior: true, card: { flag: "f" }, roleSkills: ["Go"] });
  const thRec = buildTakeHomeSetupPrompt({ roleTitle: "Backend Eng", senior: false, recruiterPrompt: "Build a rate limiter" });
  check("take-home setup fences untrusted input", thGen.includes("UNTRUSTED"));
  check("no recruiter prompt => model writes the assignment", thGen.includes('"assignment"'));
  check("recruiter prompt => do NOT invent an assignment", thRec.includes("Do NOT invent") && !thRec.includes('"assignment"'));
  check("take-home requires an EXTENSION probe (now-change-X)", thGen.includes("EXTENSION"));
  check("take-home setup carries ROLE REQUIREMENTS when present", buildTakeHomeSetupPrompt({ roleTitle: "R", senior: true, roleRequirements: "seniority: senior\nstack: Zig" }).includes("ROLE REQUIREMENTS"));
  const thSetup = normalizeTakeHomeSetup({ probeQuestions: [{ prompt: "why this trade-off?" }] }, { recruiterPrompt: "Build X", probeCount: 3 });
  check("take-home assignment: recruiter wins", thSetup.prompt === "Build X");
  check("take-home pads probes to probeCount", thSetup.probeQuestions.length === 3);
  check("take-home probe ids are p1..pN", thSetup.probeQuestions[0]?.id === "p1" && thSetup.probeQuestions[2]?.id === "p3");
  check("take-home probes all kind=probe", thSetup.probeQuestions.every((q) => q.kind === "probe"));
  check("take-home assignment: generated used when no recruiter prompt", normalizeTakeHomeSetup({ assignment: "Gen A", probeQuestions: [] }, {}).prompt === "Gen A");
  check("take-home default probe count is 3", TAKEHOME_PROBE_COUNT === 3);
  const thScoreOk = buildTakeHomeScorePrompt({ roleTitle: "R", senior: true, assignmentPrompt: "A", repoStatus: "ok", repoSummaryText: "commits_analyzed: 12", walkthrough: "I did X", probeQuestions: thSetup.probeQuestions, probeAnswers: [{ id: "p1", text: "ans" }] });
  const thScoreMissing = buildTakeHomeScorePrompt({ roleTitle: "R", senior: true, assignmentPrompt: "A", repoStatus: "unavailable", walkthrough: "", probeQuestions: thSetup.probeQuestions, probeAnswers: [] });
  check("take-home score includes deterministic repo signal when ok", thScoreOk.includes("DETERMINISTIC REPO SIGNAL") && thScoreOk.includes("commits_analyzed: 12"));
  check("take-home score flags a missing repo signal", thScoreMissing.includes("unavailable") && thScoreMissing.includes("ADD a flag"));
  check("take-home score fences untrusted input", thScoreOk.includes("UNTRUSTED"));
  check("take-home score has scoring-integrity guard", thScoreOk.includes("SCORING INTEGRITY"));
  check("take-home rubric weights thinking_authenticity", thScoreOk.includes("thinking_authenticity"));
  check("take-home scorecard suggestedAdvance from threshold", normalizeTakeHomeScorecard({ overall: 70, dimensions: [] }, 60).suggestedAdvance === true);

  console.log("stage-4 system design (senior signal; trade-offs weighted heaviest):");
  const { buildSystemDesignGenPrompt, normalizeSystemDesignSetup, buildSystemDesignScorePrompt, normalizeSystemDesignScorecard, SYSTEM_DESIGN_RUBRIC } =
    await import("@/lib/interview/systemdesign");
  const sdSenior = buildSystemDesignGenPrompt({ roleTitle: "Backend", senior: true, workHistory: [{ employer: "FinPay", scope: "ledger" }] });
  const sdJunior = buildSystemDesignGenPrompt({ roleTitle: "Backend", senior: false, roleSkills: ["Go"] });
  check("sysdesign senior grounds on work history", sdSenior.includes("WORK HISTORY") && sdSenior.includes("FinPay"));
  check("sysdesign junior grounds on role skills (no work history)", sdJunior.includes("ROLE SKILLS") && !sdJunior.includes("WORK HISTORY"));
  check("sysdesign gen fences untrusted input", sdSenior.includes("UNTRUSTED"));
  check("sysdesign gen carries ROLE REQUIREMENTS when present", buildSystemDesignGenPrompt({ roleTitle: "R", senior: true, roleRequirements: "seniority: senior" }).includes("ROLE REQUIREMENTS"));
  check("sysdesign recruiter scenario wins", normalizeSystemDesignSetup({ prompt: "gen scenario" }, { recruiterPrompt: "design a feed" }).prompt === "design a feed");
  check("sysdesign generated scenario used when no recruiter", normalizeSystemDesignSetup({ prompt: "gen scenario" }, {}).prompt === "gen scenario");
  const sdScore = buildSystemDesignScorePrompt({ roleTitle: "Backend", senior: true, prompt: "design X", response: "I'd start with requirements..." });
  check("sysdesign score fences the response", sdScore.includes("UNTRUSTED") && sdScore.includes("CANDIDATE RESPONSE"));
  check("sysdesign score has scoring-integrity guard", sdScore.includes("SCORING INTEGRITY"));
  check("sysdesign rubric weights tradeoffs highest", SYSTEM_DESIGN_RUBRIC.includes("tradeoffs_and_justification (WEIGHT: highest)"));
  check("sysdesign scorecard suggestedAdvance from threshold", normalizeSystemDesignScorecard({ overall: 40, dimensions: [] }, 60).suggestedAdvance === false);

  console.log("stage-4 setup contexts (grounding split — pure):");
  const { buildTakeHomeSetupContext, buildSystemDesignSetupContext } = await import("@/lib/interview/context");
  const jdWithPlan = {
    title: "Backend Eng",
    seniority: "senior",
    role_fit: { primary: ["Go"] },
    interviewPlan: {
      takeHome: { enabled: true, prompt: "Build Y", timeboxHours: 6 },
      systemDesign: { enabled: true, prompt: "Design Z", rubricEmphasis: "consistency" },
    },
  };
  const planFromJd = resolveInterviewPlan(jdWithPlan, true);
  const thCtx = buildTakeHomeSetupContext(seniorCand, jdWithPlan, planFromJd);
  check("take-home ctx carries recruiter prompt + timebox from plan", thCtx.recruiterPrompt === "Build Y" && thCtx.timeboxHours === 6);
  check("take-home ctx carries role requirements", (thCtx.roleRequirements ?? "").includes("seniority"));
  const sdCtx = buildSystemDesignSetupContext(seniorCand, jdWithPlan, planFromJd);
  check("sysdesign ctx carries recruiter scenario + emphasis", sdCtx.recruiterPrompt === "Design Z" && sdCtx.rubricEmphasis === "consistency");
  check("sysdesign ctx (senior) grounds on work history", sdCtx.workHistory !== undefined);
  check("sysdesign ctx carries role requirements", (sdCtx.roleRequirements ?? "").includes("seniority"));

  console.log("stage-4 finalist report compiler (pure; assistive — human decides):");
  const { compileFinalistReport } = await import("@/lib/interview/report");
  const scc = (overall: number, adv: boolean, flags?: string[]) => ({ overall, suggestedAdvance: adv, dimensions: [] as [], summary: "s", ...(flags ? { flags } : {}) });
  const repCand = {
    candidateName: "Jane Dev",
    yoe: 6,
    score: 72,
    card: { title: "Backend eng", edge: "cut p99 40%", flag: "kafka claim thin" },
    work_history: [{ employer: "FinPay" }],
    interviewRounds: {
      screen: { status: "scored", scorecard: scc(70, true, ["vague on streaming"]) },
      takeHome: { status: "scored", scorecard: scc(65, true), submission: { url: "https://github.com/x/y" } },
      systemDesign: { status: "scored", scorecard: scc(40, false, ["shallow tradeoffs"]) },
    },
  };
  const repJd = { title: "Senior Backend Engineer", seniority: "senior", role_fit: { primary: ["Go"] } };
  const rep = compileFinalistReport(repCand, repJd);
  check("report carries identity + track", rep.candidateName === "Jane Dev" && rep.track === "senior" && rep.roleTitle.includes("Senior"));
  check("report pulls ETI score + card", rep.resume.score === 72 && rep.resume.card?.flag === "kafka claim thin");
  check("report compiles all three round scorecards", rep.rounds.screen?.overall === 70 && rep.rounds.takeHome?.scorecard?.overall === 65 && rep.rounds.systemDesign?.overall === 40);
  check("report surfaces take-home repo url", rep.rounds.takeHome?.repoUrl === "https://github.com/x/y");
  check("recommendation = HOLD when advance is mixed (2 of 3)", rep.recommendation.suggested === "hold" && rep.recommendation.roundsScored === 3 && rep.recommendation.roundsAdvancing === 2);
  check("what-to-probe aggregates flags across card + rounds", rep.whatToProbe.includes("kafka claim thin") && rep.whatToProbe.includes("shallow tradeoffs") && rep.whatToProbe.includes("vague on streaming"));
  check("report is assistive (human decides)", rep.disclaimer.toLowerCase().includes("human"));
  check("no scored rounds => recommendation incomplete", compileFinalistReport({ candidateName: "New" }, repJd).recommendation.suggested === "incomplete");
  check("partial funnel (1 of 3 planned scored) => incomplete, NOT advance", compileFinalistReport({ interviewRounds: { screen: { scorecard: scc(80, true) } } }, repJd).recommendation.suggested === "incomplete");
  const screenOnlyJd = { title: "Backend Engineer", seniority: "junior", role_fit: { primary: ["Go"] }, interviewPlan: { takeHome: { enabled: false }, systemDesign: { enabled: false } } };
  check("all PLANNED rounds advance => advance", compileFinalistReport({ interviewRounds: { screen: { scorecard: scc(80, true) } } }, screenOnlyJd).recommendation.suggested === "advance");
  check("no PLANNED rounds advance => pass", compileFinalistReport({ interviewRounds: { screen: { scorecard: scc(30, false) } } }, screenOnlyJd).recommendation.suggested === "pass");

  console.log("stage-4 report delivery formatting (pure):");
  const { buildReportSummaryText, buildReportEmail, buildReportSlackBlocks } = await import("@/lib/interview/report-format");
  const summary = buildReportSummaryText(rep);
  check("summary carries name + recommendation + probes", summary.includes("Jane Dev") && summary.includes("Recommendation") && summary.includes("kafka claim thin"));
  check("summary shows per-round scores", summary.includes("screen: 70/100") && summary.includes("system design: 40/100"));
  const email = buildReportEmail(rep);
  check("email subject names the candidate + role", email.subject.includes("Jane Dev") && email.subject.includes("Senior Backend"));
  check("email body = the summary", email.body === summary);
  const blocks = buildReportSlackBlocks(rep);
  check("slack blocks non-empty + include recommendation", blocks.length > 0 && JSON.stringify(blocks).includes("Recommendation"));
  check("slack blocks carry the assistive disclaimer", JSON.stringify(blocks).toLowerCase().includes("human"));

  console.log("interview links + round keys (pure; used by the Slack invite surface):");
  const { isInterviewRoundKey, ROUND_LABEL, interviewLink } = await import("@/lib/interview/links");
  check("valid round keys accepted", isInterviewRoundKey("screen") && isInterviewRoundKey("takeHome") && isInterviewRoundKey("systemDesign"));
  check("invalid round keys rejected", !isInterviewRoundKey("foo") && !isInterviewRoundKey(""));
  check("round labels are human", ROUND_LABEL.screen === "technical screen" && ROUND_LABEL.systemDesign === "system design");
  check("take-home link has round path + encoded token", interviewLink("cand123", "takeHome", "tok abc").includes("/interview/cand123/takehome") && interviewLink("cand123", "takeHome", "tok abc").includes("t=tok%20abc"));
  check("screen link has no round subpath", /\/interview\/c\?t=/.test(interviewLink("c", "screen", "t")));

  console.log("feature flag (dark in prod unless explicitly on):");
  const { interviewsEnabled } = await import("@/lib/interview/flags");
  const prevFlag = process.env.PHASE2_INTERVIEWS_ENABLED;
  delete process.env.PHASE2_INTERVIEWS_ENABLED;
  check("flag OFF by default -> routes 404", interviewsEnabled() === false);
  process.env.PHASE2_INTERVIEWS_ENABLED = "true";
  check("flag ON when set to 'true'", interviewsEnabled() === true);
  process.env.PHASE2_INTERVIEWS_ENABLED = "1";
  check("flag OFF for any value other than 'true'", interviewsEnabled() === false);
  if (prevFlag === undefined) delete process.env.PHASE2_INTERVIEWS_ENABLED;
  else process.env.PHASE2_INTERVIEWS_ENABLED = prevFlag;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
