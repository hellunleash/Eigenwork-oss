# EigenWork worker (Cloud Run service)

The compute layer for EigenWork's long-running operations. Runs on
Google Cloud Run as a single containerized service named
`eigen-compute`. Hosts three endpoints that all exceed Vercel Hobby's
60-second function cap:

| Endpoint | Method | Used by | Auth |
|---|---|---|---|
| `/worker/evaluate` | POST | Vercel `/api/candidate/evaluate` fire-and-forget | `x-worker-secret` header |
| `/worker/evaluate` | GET | Cloud Scheduler safety-net | `Authorization: Bearer ${CRON_SECRET}` |
| `/match` | POST | Frontend direct (Firebase token) | `Authorization: Bearer <Firebase ID token>` |
| `/jd/cascade-delete` | POST | Frontend direct (Firebase token) | `Authorization: Bearer <Firebase ID token>` |
| `/health` | GET | Cloud Run health probe | none |

For the architectural reasoning see `docs/adr/001-vercel-cloud-run-hybrid.md`.

---

## First-time setup (do once)

### 1. Install + auth gcloud

```bash
# Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud config set run/region us-central1
```

### 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com
```

---

## Deploy

From the **repo root** (not `worker/`):

```bash
gcloud run deploy eigen-compute \
  --source . \
  --dockerfile worker/Dockerfile \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --concurrency 5 \
  --max-instances 10 \
  --min-instances 0 \
  --allow-unauthenticated
```

After the first deploy succeeds, **copy the URL** Cloud Run prints,
shaped like `https://eigen-compute-xxxxx-uc.a.run.app`. You'll need it
for the next two steps.

### Set env vars

Cloud Run env vars match the Vercel project's, plus an `ALLOWED_ORIGINS`
for CORS. Set them in **Cloud Console → Cloud Run → eigen-compute →
Edit & Deploy → Variables & Secrets**:

```
# Same values as Vercel
WORKER_SECRET=<32+ hex>
CRON_SECRET=<32+ hex>

# CORS allowlist for frontend-direct calls
ALLOWED_ORIGINS=https://eigenwork.com,https://www.eigenwork.com

# Firebase Admin (same service-account JSON as Vercel)
FIREBASE_SERVICE_ACCOUNT_KEY=<the JSON blob>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<same as Vercel>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<same as Vercel>

# LLM + Document AI (same as Vercel)
OPENAI_API_KEY=<same>
GEMINI_API_KEY=<same>
GITHUB_APP_CLIENT_ID=<same>
GITHUB_APP_INSTALLATION_ID=<same>
GITHUB_APP_PRIVATE_KEY=<same, PEM>
GITHUB_TOKEN=<same, PAT fallback>
GOOGLE_PROJECT_ID=<same>
GOOGLE_CLIENT_EMAIL=<same>
GOOGLE_PRIVATE_KEY=<same>
GOOGLE_PROCESSOR_ID=<same>
GOOGLE_LOCATION=<same>
```

After setting env vars, Cloud Run will deploy a new revision
automatically with them applied.

### Wire Vercel to point at Cloud Run

In **Vercel project → Settings → Environment Variables**, add two
new entries (Production + Preview + Development):

```
CLOUD_RUN_WORKER_URL=https://eigen-compute-xxxxx-uc.a.run.app
NEXT_PUBLIC_CLOUD_RUN_URL=https://eigen-compute-xxxxx-uc.a.run.app
```

Then redeploy Vercel (push any commit). The candidate-intake fire-and-
forget will now hit Cloud Run; the frontend will call Cloud Run directly
for match + JD cascade-delete.

### Schedule the cron (Cloud Scheduler replaces Vercel Cron)

```bash
gcloud scheduler jobs create http eigen-compute-cron \
  --location us-central1 \
  --schedule "* * * * *" \
  --time-zone UTC \
  --uri "https://eigen-compute-xxxxx-uc.a.run.app/worker/evaluate" \
  --http-method GET \
  --headers "Authorization=Bearer YOUR_CRON_SECRET_VALUE" \
  --attempt-deadline 30s \
  --description "EigenWork eval-job safety-net poller"
```

This is the per-minute cron Vercel Hobby refused to allow.
Cloud Scheduler is free for the first 3 jobs.

---

## Verify

```bash
# Health check
curl https://eigen-compute-xxxxx-uc.a.run.app/health
# expected: { "ok": true }

# Worker secret check (replace with your actual secret)
curl -X POST https://eigen-compute-xxxxx-uc.a.run.app/worker/evaluate \
  -H "x-worker-secret: YOUR_WORKER_SECRET" \
  -H "content-type: application/json" \
  -d '{}'
# expected: { "success": true, "claimed": false, "reason": "none" }
#   (or a real claim if there's a queued job)

# Cron path
curl https://eigen-compute-xxxxx-uc.a.run.app/worker/evaluate \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
# expected: same response shape

# Logs
gcloud run services logs read eigen-compute --limit 50
```

---

## Day-to-day redeploy

When worker logic changes (rare), from repo root:

```bash
gcloud run deploy eigen-compute --source . --dockerfile worker/Dockerfile
```

Env vars persist across redeploys.

---

## Rollback

Three levels of rollback, fastest first:

1. **Instant Vercel fallback (no Cloud Run touch needed):**
   In Vercel → Environment Variables, delete or empty both:
   - `CLOUD_RUN_WORKER_URL`
   - `NEXT_PUBLIC_CLOUD_RUN_URL`

   Redeploy Vercel. The candidate route falls back to its in-Vercel
   worker code path; the frontend falls back to calling the in-Vercel
   `/api/jd/match` and JD delete route. You're back to pre-migration
   behavior in ~2 minutes.

2. **Pause cron without deleting it:**
   ```bash
   gcloud scheduler jobs pause eigen-compute-cron --location us-central1
   ```

3. **Revert Cloud Run to a previous revision:**
   ```bash
   gcloud run revisions list --service eigen-compute --region us-central1
   gcloud run services update-traffic eigen-compute \
     --to-revisions REVISION_NAME=100 \
     --region us-central1
   ```

---

## Cost monitoring

Set a budget alert in **GCP Console → Billing → Budgets & alerts**:
- Threshold: $5/month, $25/month, $100/month
- Notification: your email

Cloud Run usage shows in **Cloud Console → Cloud Run → eigen-compute →
Metrics**. Look at: request count, request latency p99, container CPU
utilization.

---

## Architecture reference

See `docs/adr/001-vercel-cloud-run-hybrid.md` for:
- Why this exists
- Options considered (all-GCP, Vercel+GCP-backend, hybrid)
- Tradeoff analysis
- Revisit triggers
