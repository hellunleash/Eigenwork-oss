import { getAdminDb, FieldValue } from "@/lib/firebase-admin";
import { getInstallationByOrg } from "@/lib/slack/installations";
import { slackPostMessage } from "@/lib/slack/client";
import { countSubmitted } from "@/lib/agent/data";
import { deriveRoleStatus } from "@/lib/jd-status";
import { log } from "@/lib/server-logger";

/**
 * Proactive "role progress" ping (ADR-010). Called right after a candidate is
 * flipped to status "submitted" — the only moment appliedCount can change — so the
 * check is event-driven, not a cron that re-scans every role forever. It keys off
 * the candidate COUNT (the same definition the dashboard/match use), never resume
 * content, and never an LLM, so the cost is ≈ one count read per submission and the
 * Slack DM is free.
 *
 * Two thresholds, each DM'd ONCE (dedup flags on the JD doc claimed in a txn so a
 * concurrent burst can't double-ping):
 *   • ready  — appliedCount >= 60% of the cap (shortlisting unlocks)  -> readyNotifiedAt
 *   • full   — appliedCount >= the cap (link stops accepting)         -> fullNotifiedAt
 *
 * Best-effort by construction: every failure is swallowed and logged. It must
 * NEVER throw into the evaluation path (a missing Slack install, a Slack API
 * hiccup, etc. just means no ping).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function maybeNotifyRoleProgress(jobId: string | null | undefined): Promise<void> {
  if (!jobId) return;
  try {
    const db = getAdminDb();
    const jdRef = db.collection("jds").doc(jobId);
    const jd = (await jdRef.get()).data();
    if (!jd) return;

    const orgId = typeof jd.orgId === "string" ? jd.orgId : null;
    if (!orgId) return;
    const rawCap = typeof jd.submissionCap === "number" ? jd.submissionCap : parseInt(String(jd.submissionCap ?? ""), 10);
    const cap = Number.isInteger(rawCap) && rawCap >= 1 ? rawCap : 0;
    if (cap <= 0) return;

    // Both pings already sent → nothing to do; skip the count read entirely.
    if (jd.readyNotifiedAt && jd.fullNotifiedAt) return;

    // appliedCount + status from the SAME shared helpers the dashboard and the
    // bot's roles answer use — no private count/threshold copy here.
    const applied = await countSubmitted(jobId);
    const isClosed = Boolean(jd.isClosed);
    const mr = jd.matchResult as { top20?: unknown[] } | undefined;
    const hasMatchResult = Array.isArray(mr?.top20) && mr.top20.length > 0;
    const status = deriveRoleStatus({ isClosed, hasMatchResult, submissionCap: cap, appliedCount: applied });
    if (status === "closed") return; // already shortlisted / manually closed — nothing to nudge

    const crossedReady = status === "ready"; // shared 60% threshold lives in deriveRoleStatus
    const crossedFull = applied >= cap; // the status enum has no "full" state, so this stays explicit
    if (!crossedReady && !crossedFull) return;

    // Atomically claim the threshold flag so only one concurrent writer DMs.
    const serverTs = FieldValue.serverTimestamp();
    const claimed = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(jdRef)).data() ?? {};
      const ready = Boolean(cur.readyNotifiedAt);
      const full = Boolean(cur.fullNotifiedAt);
      if (crossedFull && !full) {
        tx.set(jdRef, { fullNotifiedAt: serverTs, ...(ready ? {} : { readyNotifiedAt: serverTs }) }, { merge: true });
        return "full" as const;
      }
      if (crossedReady && !ready) {
        tx.set(jdRef, { readyNotifiedAt: serverTs }, { merge: true });
        return "ready" as const;
      }
      return null;
    });
    if (!claimed) return;

    const install = await getInstallationByOrg(orgId);
    if (!install?.botToken || !install.installerSlackUserId) return; // org has no Slack DM target

    const title = typeof jd.title === "string" && jd.title ? jd.title : "your role";
    const dash = APP_URL ? ` Or open the dashboard: ${APP_URL}/user/dashboard` : "";
    const text =
      claimed === "full"
        ? `📥 *${title}* just hit its applicant limit (${applied}/${cap}) — the link's closed to new applicants. Time to shortlist: ask me *who are my top candidates for ${title}?*${dash}`
        : `✅ *${title}* is ready to shortlist — *${applied}/${cap}* applicants in (60%+). You can shortlist now, or keep collecting until it fills. Ask me *who are my top candidates for ${title}?*${dash}`;

    await slackPostMessage(install.botToken, { channel: install.installerSlackUserId, text });
    log("info", "agent.role_notify_sent", { jobId, orgId, applied, cap, kind: claimed });
  } catch (err) {
    log("warn", "agent.role_notify_failed", { jobId }, err);
  }
}
