import { NextRequest, NextResponse } from "next/server";
import { runJsonModel } from "@/lib/openai-client";

import { getRepoDNA } from "@/lib/github-utils";
import { getAdminDb, FieldValue, adminStorageUpload } from "@/lib/firebase-admin";
import { getUserProfile, updateUserEigenCredits } from "@/lib/user-credits";

import {
  buildETIPrompt,
  truncateInput,
  cleanAndParseJSON
} from "@/lib/eti/rubric-compress";

import { extractResumeText } from "@/lib/docai-extract";


export const maxDuration = 300; // ⬅️ IMPORTANT: allows huge output
export const dynamic = "force-dynamic";


// ------------------------------------------------------
// SAFE MODEL CALL (retries + streaming safe)
// ------------------------------------------------------
async function safeGenerate(prompt: string) {
  let attempts = 0;

  while (attempts < 2) {
    try {
      const text = await runJsonModel(prompt, 10000);
      return text;
    } catch (err) {
      attempts++;
      console.log("⚠️ GPT-5.2 error attempt:", attempts, err);

      if (attempts >= 2) throw err;
      await new Promise((r) => setTimeout(r, 1200 * attempts));
    }
  }
}


// Raw ETI is 0–85 (junior: ESQ+PDQ+NR; senior: OM+OD+PC). Normalize to 0–100 for display.
// Candidates with normalized score < 50 are shown on dashboard but not considered for matching.
const MAX_RAW_SCORE = 85;
function normalizeScore(raw: number): number {
  return Math.min(100, Math.round((raw / MAX_RAW_SCORE) * 100));
}

// Validate AI-returned yoe: must be a finite number 0–99.9.
function safeYoe(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99.9) return undefined;
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------
// JSON CLEANER
// ------------------------------------------------------
function extractJSON(text: string) {
  try {
    return cleanAndParseJSON(text);
  } catch (e) {
    console.error("❌ JSON extract failed:", text);
    return {};
  }
}


// ------------------------------------------------------
// MAIN ROUTE
// ------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      workTypes,
      locations,
      experience,
      minCompensation,
      maxCompensation,
      resumeBase64,
      githubUrl,
      projectLinks,
      jobId
    } = body;

    const cleanBase64 = resumeBase64 ? String(resumeBase64).replace(/^data:(.*?);base64,/, "") : null;

    const serverDate = new Date().toISOString().slice(0, 10);

    // ------------------------------------------------------
    // Load job owner for credit deduction later (intake page already pauses when credits = 0)
    // ------------------------------------------------------
    let userId: string | null = null;
    if (jobId && typeof jobId === "string") {
      const db = getAdminDb();
      const jobSnap = await db.collection("jds").doc(jobId).get();
      const jobData = jobSnap.data();
      userId = typeof jobData?.userId === "string" ? jobData.userId : null;
    }

    // ------------------------------------------------------
    // RESUME → TEXT
    // ------------------------------------------------------
    let extractedText = "";

    if (cleanBase64) {
      extractedText = await extractResumeText(cleanBase64);
      console.log("📄 Resume extracted:", extractedText.substring(0, 300));
    }

    const resumeContext = truncateInput(
      `RESUME CONTENT:\n${extractedText || "No text extracted"}`,
      20000
    );


    // ------------------------------------------------------
    // Github DNA (junior only)
    // ------------------------------------------------------
    const isJunior = experience === "<2";
    let githubContext = "No GitHub";

    if (isJunior && githubUrl) {
      try {
        githubContext = (await getRepoDNA(githubUrl)) || "Repo inaccessible";
      } catch {
        githubContext = "Repo inaccessible";
      }
    }


    let finalResult: any = {};

    // ------------------------------------------------------
    // JUNIOR MODE
    // ------------------------------------------------------
    if (isJunior) {

      // --- BLOCK 1: ESQ ---
      const promptESQ = buildETIPrompt({
        context: githubContext,
        mode: "junior-esq"
      });

      const rawESQ = String(await safeGenerate(promptESQ));
      console.log("🟦 ESQ RAW OUTPUT:", rawESQ.substring(0, 300));
      const jsonESQ = extractJSON(rawESQ);
      const esq = jsonESQ ?? {};
      const ESQ = (Number(esq.A1) || 0) + (Number(esq.A2) || 0) + (Number(esq.A3) || 0) + (Number(esq.A4) || 0);

      // --- BLOCK 2+3: Behavioral ---
      const promptBehav = buildETIPrompt({
        context: resumeContext,
        mode: "junior-behavioral",
        currentDate: serverDate
      });

      const rawBehav = String(await safeGenerate(promptBehav));
      console.log("🟩 BEHAVIOR RAW OUTPUT:", rawBehav.substring(0, 300));
      const jsonBehav = extractJSON(rawBehav);

      // Compute block totals from sub-scores so breakdown always adds up
      const pdq = jsonBehav?.pdq_breakdown ?? {};
      const nr = jsonBehav?.nr_breakdown ?? {};
      const PDQ = (Number(pdq.B1) || 0) + (Number(pdq.B2) || 0) + (Number(pdq.B3) || 0);
      const NR = (Number(nr.C1) || 0) + (Number(nr.C2) || 0);

      // --- SCORING ---
      let rawScore = ESQ + PDQ + NR;
      console.log("overlord:", jsonBehav?.overlord);
      if (jsonBehav.overlord === "inflated_cap_40") rawScore = Math.min(rawScore, 40);
      if (jsonBehav.overlord === "suspicious_cap_46") rawScore = Math.min(rawScore, 46);
      const score = normalizeScore(rawScore);
      const yoe = safeYoe(jsonBehav?.yoe);

      console.log("🟦 JUNIOR COMPUTED: ESQ=" + ESQ + " PDQ=" + PDQ + " NR=" + NR + " → raw=" + rawScore + " normalized=" + score + (yoe != null ? " yoe=" + yoe : ""));

      finalResult = {
        score,
        ...(yoe != null && { yoe }),
        breakdown: {
          ESQ: { ...esq, ESQ },
          PDQ: { ...pdq, PDQ },
          NR: { ...nr, NR }
        },
        profile: jsonBehav.operating_profile,
        is_matchable: score >= 50
      };
    }


    // ------------------------------------------------------
    // SENIOR MODE
    // ------------------------------------------------------
    else {

      const promptSenior = buildETIPrompt({
        context: resumeContext,
        mode: "senior",
        currentDate: serverDate
      });

      const raw = String(await safeGenerate(promptSenior));
      console.log("🟥 SENIOR RAW OUTPUT:", raw.substring(0, 300));

      const json = extractJSON(raw);

      // Compute block totals from sub-scores so breakdown always adds up
      const om = json?.om_breakdown ?? {};
      const od = json?.od_breakdown ?? {};
      const pc = json?.pc_breakdown ?? {};
      const OM = (Number(om.A1) || 0) + (Number(om.A2) || 0) + (Number(om.A3) || 0);
      const OD = (Number(od.B1) || 0) + (Number(od.B2) || 0) + (Number(od.B3) || 0);
      const PC = (Number(pc.C1) || 0) + (Number(pc.C2) || 0) + (Number(pc.C3) || 0);

      let rawScore = OM + OD + PC;
      console.log("overlord:", json?.overlord);
      if (json.overlord === "inflated_cap_40") rawScore = Math.min(rawScore, 40);
      if (json.overlord === "suspicious_cap_46") rawScore = Math.min(rawScore, 46);
      const score = normalizeScore(rawScore);
      const yoe = safeYoe(json?.yoe);

      console.log("🟥 SENIOR COMPUTED: OM=" + OM + " OD=" + OD + " PC=" + PC + " → raw=" + rawScore + " normalized=" + score + (yoe != null ? " yoe=" + yoe : ""));

      const op = json.operating_profile || {};
      finalResult = {
        score,
        ...(yoe != null && { yoe }),
        breakdown: {
          OM: { ...om, OM },
          OD: { ...od, OD },
          PC: { ...pc, PC }
        },
        profile: { ...op, ramp_expectation: op.ramp ?? op.ramp_expectation },
        is_matchable: score >= 50
      };
    }


    // ------------------------------------------------------
    // SAVE TO FIRESTORE (no resumeBase64; resumeUrl added after upload)
    // ------------------------------------------------------
    const db = getAdminDb();
    const docRef = await db.collection("candidates").add({
      ...finalResult,
      candidateName: name ?? "",
      email: email ?? "",
      phone: phone || null,
      matchData: {
        jobId: jobId ?? null,
        workTypes,
        locations,
        minSalary: minCompensation,
        maxSalary: maxCompensation,
        yearsExperience: experience,
        github: githubUrl || null,
        portfolio: projectLinks || []
      },
      experienceLevel: isJunior ? "Junior" : "Senior",
      timestamp: FieldValue.serverTimestamp(),
      status: "submitted"
    });

    let resumeUrl: string | null = null;
    if (cleanBase64) {
      try {
        const bytes = Buffer.from(cleanBase64, "base64");
        resumeUrl = await adminStorageUpload(`resumes/${docRef.id}.pdf`, bytes);
        await db.collection("candidates").doc(docRef.id).update({ resumeUrl });
      } catch (uploadErr) {
        console.error("❌ Resume upload failed:", uploadErr);
      }
    }

    if (userId) {
      try {
        const profile = await getUserProfile(userId);
        if (profile.eigenCredits > 0) {
          await updateUserEigenCredits(userId, -1);
        }
      } catch (creditsErr) {
        console.error("❌ EigenCredits deduction failed:", creditsErr);
      }
    }

    return NextResponse.json({
      success: true,
      id: docRef.id,
      redirect: `/candidate/dashboard?id=${docRef.id}`,
      ...finalResult,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing Failed";
    console.error("❌ EVALUATION ERROR:", error);
    return NextResponse.json(
      { error: "Processing Failed", message },
      { status: 500 }
    );
  }
}
