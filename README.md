# EigenWork

**[eigenwork.com](https://www.eigenwork.com)** · **Technical hiring, right from Slack.** @mention EigenBot, and it screens engineers, ranks your
shortlist, moves candidates through the pipeline and drafts outreach. You don't need to open another tab.

```
@EigenBot who are the top 3 for the backend role?
@EigenBot send me Maya's resume
@EigenBot move the first two to the take-home
```

Candidates apply with a GitHub repo + resume. A scoring engine reads both, builds a short
result card (title, edge, flag), and ranks the candidate against each role.

---

## How it fits together

```
 Slack ──► /api/slack/events ──► verify sig ─► dedupe ─► resolve actor ─► budget ─► agent loop
                                                                                      │
                                                    reads ◄── org-scoped data layer ◄─┤
                                                    writes ──► confirm card ──► human click
                                                                                      │
 Candidate intake ──► Vercel ──► Cloud Run worker ──► GitHub signal + Doc AI resume ──► LLM scoring ──► Firestore
```

- **Web app:** Next.js 16 / React 19 on Vercel
- **Compute:** Cloud Run worker for scoring, matching and resume parsing
- **Agent:** tool-calling loop on Gemini 2.5 Flash; scoring on OpenAI (flex tier + prompt caching)
- **Data:** Firebase Auth + Firestore + Storage, with deny-all rules (all access goes through the server)
- **Signals:** GitHub App (repo DNA), Google Document AI (resume parsing)
- **Analytics:** Firestore → BigQuery → KPI snapshots on a 15-min cron
- **Billing:** Paddle (HMAC-verified webhooks, idempotent credits)

---

## 1. Slack auth that fails closed

Only two people get an answer: the workspace installer, or a Slack user whose email maps to a
member of the same org. Everyone else gets nothing.

```ts
// lib/slack/auth.ts
export async function resolveSlackActor(installation, slackUserId): Promise<SlackActor | null> {
  // 1. Installer, by their captured Slack id.
  if (installation.installerSlackUserId && slackUserId === installation.installerSlackUserId) {
    return { orgId: installation.orgId, userId: installation.installerUid, mappedFromEmail: false };
  }

  // 2. Anyone else must map email → uid → in-org membership.
  const email = await slackGetUserEmail(installation.botToken, slackUserId);
  const user = email && (await getAdminAuth().getUserByEmail(email).catch(() => null));
  if (user && (await getOrgRole(installation.orgId, user.uid))) {
    return { orgId: installation.orgId, userId: user.uid, mappedFromEmail: true };
  }

  // 3. Fail closed.
  return null;
}
```

`orgId` always comes from the resolved actor, **never from model output**.

## 2. The agent can read, but it can only *propose* writes

A bounded loop (max 5 steps). Read tools run right away. A write tool (move stage, run match,
open a role, invite to interview) builds a Block Kit confirm card and **ends the turn**. The
change itself runs only when a human clicks Confirm, and that handler re-checks org ownership.

```ts
// lib/agent/tool-loop.ts
for (let step = 1; step <= MAX_STEPS; step++) {
  const calls = result.response.functionCalls() ?? [];
  if (calls.length === 0) break;                        // model gave a final answer

  for (const call of calls) {
    await auditCall(params, call.name, call.args);
    if (isWriteTool(call.name)) {
      const w = await proposeWrite(call.name, call.args, ctx);
      if ("proposal" in w) { reply = w.proposal; proposed = true; break; }  // human drives it
    } else {
      const r = await dispatchRead(call.name, call.args, ctx);
      responseParts.push({ functionResponse: { name: call.name, response: r } });
    }
  }
  if (proposed) break;
  result = await chat.sendMessage(responseParts);
}
```

## 3. Scoring that degrades honestly

If GitHub is down or rate-limited, the candidate isn't punished with a zero. The resume-side score is
renormalized, but it is capped below the top band, because there was no code evidence. The fraud-risk
check runs in **shadow mode**: it raises a flag on the card instead of silently dropping the score.

```ts
// lib/evaluation-runner.ts
const appliedCap = enforceJuniorOverlord() ? overlord : undefined;   // shadow by default

if (esqStatus === "unavailable") {
  // No GitHub evidence: renormalize resume signals over 50, then hard-cap at 79.
  rawScore = applyOverlordCap(PDQ + NR, appliedCap, JUNIOR_NO_ESQ_MAX_RAW);
  score = Math.min(UNAVAILABLE_SCORE_CAP, normalizeScore(rawScore, JUNIOR_NO_ESQ_MAX_RAW));
} else {
  rawScore = applyOverlordCap(ESQ + PDQ + NR, appliedCap, MAX_RAW_SCORE);
  score = normalizeScore(rawScore, MAX_RAW_SCORE);
}

if (overlord && !appliedCap) log("info", "overlord.junior_shadow", { wouldCap: overlord });
```

---

## Repo map

```
app/api/slack/*          events, interactivity (confirm clicks), oauth, install
app/api/candidate/*      public intake (rate limit + honeypot + Turnstile + PDF checks)
lib/agent/               EigenBot: loop, tools, org-scoped data layer, budget, audit
lib/slack/               signature verify, actor auth, dedupe, installations
lib/evaluation-runner.ts scoring engine
lib/cards/               result-card validation + deterministic fallbacks
lib/interview/           AI screen, take-home, system-design rounds
worker/                  Cloud Run container (scoring, match, cron)
```

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in Firebase, OpenAI, Gemini, GitHub App, Slack keys
npm run dev
```

Type-check: `npx tsc --noEmit`

---

Built solo by [@hellunleash](https://github.com/hellunleash).
