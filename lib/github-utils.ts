import { createSign } from "crypto";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
// Two supported modes:
//   1. GitHub App installation token (preferred). Set:
//        GITHUB_APP_CLIENT_ID         (preferred; "Iv23li..." or "Iv1.xxx")
//        GITHUB_APP_INSTALLATION_ID   (numeric installation id)
//        GITHUB_APP_PRIVATE_KEY       (PEM, \n-escaped or raw)
//      For backward compatibility, GITHUB_APP_ID (the legacy numeric App ID)
//      is still accepted as a fallback for the JWT `iss` claim. GitHub
//      validates either, but Client ID is the going-forward identifier.
//      Installation tokens grant 15,000+ REST requests/hour vs 5,000 for a PAT.
//   2. Personal Access Token fallback (GITHUB_TOKEN). Existing deployments
//      keep working unchanged.
// We resolve auth lazily per request via getGithubAuthHeader, with an in-process
// cache for the installation token (refreshed 5 min before expiry).
// ---------------------------------------------------------------------------

// GitHub allows either the new Client ID or the legacy numeric App ID as the
// JWT `iss` claim. Prefer Client ID; fall back to App ID if only that is set.
const GITHUB_APP_ISSUER =
  process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_APP_ID;
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
// Accept the correctly-named env var first. If only the (historical) typo'd
// name is set, fall through to it and warn once so the operator knows to
// rename the env in their hosting provider. See bugs-fixed/security.txt
// (2026-06-03) under "GitHub App env var tolerance".
const GITHUB_APP_PRIVATE_KEY_RAW =
  process.env.GITHUB_APP_PRIVATE_KEY ?? process.env.GITHUB_APP_PRVATE_KEY;
if (
  !process.env.GITHUB_APP_PRIVATE_KEY &&
  process.env.GITHUB_APP_PRVATE_KEY
) {
  console.warn(
    "[github-utils] GITHUB_APP_PRVATE_KEY env var is being used (typo). " +
      "Rename to GITHUB_APP_PRIVATE_KEY in your hosting provider."
  );
}
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// PEM keys in env are often escaped with literal \n; normalize.
const GITHUB_APP_PRIVATE_KEY = GITHUB_APP_PRIVATE_KEY_RAW
  ? GITHUB_APP_PRIVATE_KEY_RAW.replace(/\\n/g, "\n")
  : undefined;

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signAppJwt(issuer: string, privateKeyPem: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // GitHub recommends iat slightly in the past (clock skew) and exp ≤ 10 min.
  // `iss` is the GitHub App's Client ID (preferred) or numeric App ID (legacy).
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: issuer }));
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const sig = signer.sign(privateKeyPem);
  return `${data}.${b64url(sig)}`;
}

let cachedInstallationToken: { token: string; expiresAtMs: number } | null = null;
let inflightTokenFetch: Promise<string> | null = null;

async function fetchInstallationToken(): Promise<string> {
  if (!GITHUB_APP_ISSUER || !GITHUB_APP_INSTALLATION_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error("github_app_env_missing");
  }
  const jwt = signAppJwt(GITHUB_APP_ISSUER, GITHUB_APP_PRIVATE_KEY);
  // See note in rawGithubFetch about the `cache` extension to RequestInit.
  const installInit: RequestInit & { cache?: "no-store" } = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  };
  const res = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(GITHUB_APP_INSTALLATION_ID)}/access_tokens`,
    installInit
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`github_app_installation_token_failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token || !data.expires_at) {
    throw new Error("github_app_installation_token_malformed");
  }
  const expiresAtMs = new Date(data.expires_at).getTime();
  cachedInstallationToken = { token: data.token, expiresAtMs };
  return data.token;
}

async function getGithubAuthHeader(): Promise<string | null> {
  if (GITHUB_APP_ISSUER && GITHUB_APP_INSTALLATION_ID && GITHUB_APP_PRIVATE_KEY) {
    const now = Date.now();
    if (cachedInstallationToken && cachedInstallationToken.expiresAtMs - now > 5 * 60 * 1000) {
      return `Bearer ${cachedInstallationToken.token}`;
    }
    // Coalesce concurrent refreshes.
    if (!inflightTokenFetch) {
      inflightTokenFetch = fetchInstallationToken().finally(() => {
        inflightTokenFetch = null;
      });
    }
    try {
      const tok = await inflightTokenFetch;
      return `Bearer ${tok}`;
    } catch (err) {
      console.warn("[getRepoDNA] GitHub App token refresh failed; falling back:", err);
      // Fall through to PAT if available.
    }
  }
  return GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : null;
}

// ---------------------------------------------------------------------------
// Concurrency limiter + rate-limit-aware retry
// ---------------------------------------------------------------------------
// GitHub's primary REST limit is 5,000/hour (PAT) or 15,000/hour (App). The
// more common failure mode at burst is the secondary rate limit, which trips
// on concurrency from a single client even when the hourly budget is healthy.
// A 3-slot semaphore keeps us well below that threshold while still allowing
// useful parallelism across concurrent junior evaluations.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_GITHUB = 3;
let activeGithubRequests = 0;
const githubWaitQueue: Array<() => void> = [];

function acquireGithubSlot(): Promise<void> {
  if (activeGithubRequests < MAX_CONCURRENT_GITHUB) {
    activeGithubRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    githubWaitQueue.push(() => {
      activeGithubRequests++;
      resolve();
    });
  });
}

function releaseGithubSlot(): void {
  activeGithubRequests--;
  const next = githubWaitQueue.shift();
  if (next) next();
}

// Cap on rate-limit backoff so a stuck request can't pin a worker forever.
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

// Transient-failure retry (separate from rate-limit). A 5xx or a network throw
// on a single GitHub call used to fail the whole extraction (→ "Repo
// inaccessible" → ESQ floored to 0). We now retry these a few times with
// jittered exponential backoff. 404 and non-rate-limit 4xx are NOT retried —
// they mean the resource genuinely isn't there (wrong branch/sha, renamed,
// private), so retrying only wastes time.
const MAX_GITHUB_ATTEMPTS = 3;
const TRANSIENT_BACKOFF_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function transientBackoff(attempt: number): number {
  const base = Math.min(MAX_RATE_LIMIT_WAIT_MS, TRANSIENT_BACKOFF_MS * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

/**
 * If the response indicates a rate limit, sleep up to MAX_RATE_LIMIT_WAIT_MS
 * and return true so the caller can retry once. Otherwise return false.
 */
async function maybeSleepForRateLimit(res: Response, url: string): Promise<boolean> {
  if (res.status !== 403 && res.status !== 429) return false;

  // Secondary rate limit / abuse detection sets Retry-After.
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const sec = parseInt(retryAfter, 10);
    if (Number.isFinite(sec) && sec > 0) {
      const waitMs = Math.min(MAX_RATE_LIMIT_WAIT_MS, sec * 1000);
      console.warn(
        `[getRepoDNA] GitHub secondary rate limit: sleeping ${waitMs}ms (${url.split("?")[0]})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return true;
    }
  }

  // Primary rate limit: X-RateLimit-Remaining=0 + X-RateLimit-Reset epoch seconds.
  const remaining = parseInt(res.headers.get("x-ratelimit-remaining") || "1", 10);
  if (remaining === 0) {
    const reset = parseInt(res.headers.get("x-ratelimit-reset") || "0", 10);
    if (Number.isFinite(reset) && reset > 0) {
      const waitMs = Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(0, reset * 1000 - Date.now()));
      if (waitMs > 0) {
        console.warn(
          `[getRepoDNA] GitHub primary rate limit: sleeping ${waitMs}ms (${url.split("?")[0]})`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        return true;
      }
    }
  }
  return false;
}

type FetchOpts = { useNextCache: boolean };

async function rawGithubFetch(url: string, opts: FetchOpts): Promise<Response> {
  const auth = await getGithubAuthHeader();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (auth) headers["Authorization"] = auth;

  // `cache` is part of the WHATWG Fetch spec and works in Node 18+ at
  // runtime, but it isn't on the bare `RequestInit` shipped via @types/node.
  // We extend the type so this file compiles under both the Next.js (DOM lib)
  // and Cloud Run worker (ES2022 only) tsconfigs. `next` is Next.js-specific
  // and is only set on the Vercel side; the worker path uses `cache` instead.
  const init: RequestInit & {
    next?: { revalidate: number };
    cache?: "default" | "no-store" | "reload" | "no-cache" | "force-cache" | "only-if-cached";
  } = { headers };
  if (opts.useNextCache) {
    init.next = { revalidate: 3600 };
  } else {
    init.cache = "no-store";
  }
  return fetch(url, init);
}

/**
 * Single-retry rate-limit-aware GET that returns parsed JSON (or null).
 * Concurrency-capped via acquireGithubSlot.
 */
async function githubGetJson(
  url: string,
  opts: FetchOpts,
  label: string
): Promise<Record<string, unknown> | null> {
  await acquireGithubSlot();
  const path = url.split("?")[0];
  try {
    let lastStatus = 0;
    for (let attempt = 0; attempt < MAX_GITHUB_ATTEMPTS; attempt++) {
      try {
        const res = await rawGithubFetch(url, opts);
        if (res.ok) return (await res.json()) as Record<string, unknown>;
        lastStatus = res.status;

        // 404 = genuinely absent (wrong branch/sha, renamed, private, or a bad
        // owner/repo from URL parsing). Retrying can't help; fail fast.
        if (res.status === 404) {
          console.warn(`[getRepoDNA] GitHub 404 via ${label}: ${path}`);
          return null;
        }

        // 403 / 429 = rate limit (primary or secondary) OR a plain forbidden.
        if (res.status === 403 || res.status === 429) {
          const slept = await maybeSleepForRateLimit(res, url);
          if (slept) continue; // server told us how long to wait; retry
          const body = await res.text().catch(() => "");
          const rateLimited = /rate limit|rate_limit|abuse|secondary/i.test(body);
          if (rateLimited && attempt < MAX_GITHUB_ATTEMPTS - 1) {
            // Rate limited but no usable Retry-After/Reset header — back off.
            await sleep(transientBackoff(attempt));
            continue;
          }
          console.warn(
            `[getRepoDNA] GitHub ${res.status}${rateLimited ? " (rate limit, no header)" : " (forbidden — token scope/private?)"} via ${label}: ${path}`
          );
          return null;
        }

        // 5xx = transient server-side error. Back off and retry.
        if (res.status >= 500) {
          if (attempt < MAX_GITHUB_ATTEMPTS - 1) {
            await sleep(transientBackoff(attempt));
            continue;
          }
          console.warn(`[getRepoDNA] GitHub ${res.status} (server) via ${label}: ${path}`);
          return null;
        }

        // Any other 4xx is a client error we won't fix by retrying.
        console.warn(`[getRepoDNA] GitHub ${res.status} via ${label}: ${path}`);
        return null;
      } catch (err) {
        // Network / DNS / timeout throw — transient. Back off and retry.
        if (attempt < MAX_GITHUB_ATTEMPTS - 1) {
          await sleep(transientBackoff(attempt));
          continue;
        }
        console.warn(`[getRepoDNA] GitHub fetch threw via ${label} (final):`, err);
        return null;
      }
    }
    console.warn(
      `[getRepoDNA] GitHub exhausted ${MAX_GITHUB_ATTEMPTS} attempts via ${label} (last status ${lastStatus}): ${path}`
    );
    return null;
  } finally {
    releaseGithubSlot();
  }
}

async function githubFetch(url: string): Promise<Record<string, unknown> | null> {
  return githubGetJson(url, { useNextCache: true }, "fetch");
}

/** Fetch GitHub data without using Next.js data cache (for large JSON responses like git trees). */
async function githubFetchNoCache(url: string): Promise<Record<string, unknown> | null> {
  return githubGetJson(url, { useNextCache: false }, "fetchNoCache");
}

/** Fetch GitHub blob URL without Next.js cache (blobs can be >2MB; Next cache limit is 2MB). */
async function githubFetchBlob(url: string): Promise<Record<string, unknown> | null> {
  return githubGetJson(url, { useNextCache: false }, "fetchBlob");
}

// Normalize the many shapes a candidate can paste into a github.com URL object:
// missing scheme ("github.com/..."), "www." host, "http://", trailing slashes,
// and "/tree/<branch>/..." deep links. Returns null for non-github hosts.
function normalizeGithubUrl(raw: string): URL | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  // Add scheme if the user pasted a bare "github.com/owner/repo".
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "github.com") return null;
    return u;
  } catch {
    return null;
  }
}

// Repos are commonly pasted with a ".git" suffix (clone URL); strip it.
function stripDotGit(repo: string): string {
  return repo.replace(/\.git$/i, "");
}

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  // SSH clone form "git@github.com:owner/repo(.git)" — URL() can't parse it.
  const ssh = (url || "").trim().match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (ssh) return { owner: ssh[1], repo: stripDotGit(ssh[2]) };

  const u = normalizeGithubUrl(url);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  // parts[0]=owner, parts[1]=repo; any "/tree/<branch>/..." tail is ignored.
  return { owner: parts[0], repo: stripDotGit(parts[1]) };
}

/** Returns { username } for profile URLs like https://github.com/waifuexists */
function parseGithubUserUrl(url: string): { username: string } | null {
  const u = normalizeGithubUrl(url);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  return { username: parts[0] };
}

/**
 * Resolve input URL to a single repo { owner, repo }.
 * - Repo URL (e.g. .../owner/repo) → use that repo.
 * - Profile URL (e.g. .../username) → list public repos and pick one (by updated, then stars).
 */
async function resolveToRepo(repoUrl: string): Promise<{ owner: string; repo: string } | null> {
  const repoInfo = parseGithubUrl(repoUrl);
  if (repoInfo) return repoInfo;

  const userInfo = parseGithubUserUrl(repoUrl);
  if (!userInfo) return null;

  const listUrl = `https://api.github.com/users/${encodeURIComponent(userInfo.username)}/repos?per_page=20&sort=updated`;
  const list = await githubFetch(listUrl);
  if (!list || !Array.isArray(list)) return null;

  const repos = list as Array<{ name: string; owner?: { login?: string }; stargazers_count?: number }>;
  if (repos.length === 0) {
    console.warn("[getRepoDNA] User has no public repos:", userInfo.username);
    return null;
  }

  const sorted = [...repos].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
  const chosen = sorted[0];
  const owner = chosen.owner?.login ?? userInfo.username;
  const repo = chosen.name;
  return { owner, repo };
}

const BACKEND_EXTENSIONS = [".ts", ".js", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".swift"];
const MAX_FILE_BYTES = 400 * 1024; // 400KB
const BYTES_PER_LINE_ESTIMATE = 50; // for approx line count from tree (no line metadata)

type TreeEntry = { path: string; type: string; url?: string; size?: number };

function isBackendCodeFile(entry: TreeEntry): boolean {
  if (entry.type !== "blob") return false;
  const pathLower = entry.path.toLowerCase();
  const hasExt = BACKEND_EXTENSIONS.some((ext) => pathLower.endsWith(ext));
  if (!hasExt) return false;
  const size = entry.size ?? 0;
  if (size > MAX_FILE_BYTES) return false;
  return true;
}

/** Approx line count from tree metadata (GitHub tree has size only). */
function approxLines(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / BYTES_PER_LINE_ESTIMATE));
}

const CORE_FILE_SELECT_PROMPT = `You are selecting the single fileEntry that most likely contains the true backend logic of the repository.

Do NOT choose based on file or folder names alone.
Do NOT select UI, frontend, tests, examples, demos, or trivial wrappers.

Choose the fileEntry whose contents most strongly indicate real backend engineering work:
• routing or endpoint handling (e.g. route.ts, server.js, main.go)
• request → processing → response pipelines
• orchestration logic
• controller/service/handler layers
• algorithmic or transformation-heavy code
• integration logic (DB, LLM, APIs, background jobs)
• multi-step control flow with meaningful decisions

Ignore:
• configs, manifests, JSON files
• tiny launcher scripts (e.g., thin main.py that only imports and runs)
• simple utilities or helpers
• UI-related code (HTML, CSS, TSX, JSX)
• browser extensions unless they contain backend-like processing
• scripts under 30–40 LOC that perform only setup or printing

If a file is named "main" or similar, choose it ONLY if it contains substantial logic beyond bootstrapping.

Return exactly one file path as a plain string with no explanation.`;

async function selectCoreFileWithGemini(fileEntries: Array<{ path: string; size: number; lines: number }>): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[getRepoDNA] GEMINI_API_KEY not set; cannot run AI-assisted core file selection.");
    return null;
  }
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0 },
  });
  const jsonFileEntries = JSON.stringify(fileEntries, null, 2);
  const prompt = `${CORE_FILE_SELECT_PROMPT}\n\nFile entries (path, size in bytes, approx lines):\n${jsonFileEntries}`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text()?.trim() ?? "";
  if (!raw) return null;
  // Normalize: strip quotes and whitespace so we can match against tree paths
  const path = raw.replace(/^["']|["']$/g, "").trim();
  return path || null;
}

async function buildCoreFile(
  _owner: string,
  _repo: string,
  allFiles: Array<TreeEntry>
): Promise<string> {
  const backendFiles = allFiles.filter(isBackendCodeFile);
  if (backendFiles.length === 0) return "No suitable backend core file found.";

  const fileEntries: Array<{ path: string; size: number; lines: number }> = backendFiles.map((f) => ({
    path: f.path,
    size: f.size ?? 0,
    lines: approxLines(f.size ?? 0),
  }));

  const selectedPath = await selectCoreFileWithGemini(fileEntries);
  if (!selectedPath) return "No suitable backend core file found.";

  const selected = backendFiles.find((f) => f.path === selectedPath);
  if (!selected?.url) return "No suitable backend core file found.";

  const blob = await githubFetchBlob(selected.url) as { content?: string } | null;
  if (!blob?.content) return "No suitable backend core file found.";

  const fullContent = Buffer.from(blob.content, "base64").toString("utf-8");
  const lines = fullContent.split("\n");
  const totalLines = lines.length;

  const headLines = totalLines < 100 ? lines : lines.slice(0, 200);
  const tailLines = totalLines < 100 ? [] : lines.slice(-50);

  const headBlock = headLines.join("\n");
  const tailBlock = tailLines.join("\n");

  const pathToLog = selected.path.length > 200 ? selected.path.slice(0, 200) : selected.path;
  console.log(pathToLog);

  return `=== CORE BACKEND FILE ===
Path: ${selected.path}
— HEAD (first 200 lines) —
${headBlock}
— TAIL (last 50 lines) —
${tailBlock}
=== PROJECT TYPE ===
backend`;
}

export async function getRepoDNA(repoUrl: string): Promise<string | null> {
  const resolved = await resolveToRepo(repoUrl);
  if (!resolved) return null;

  const { owner, repo } = resolved;
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const repoData = await githubFetch(baseUrl) as { default_branch?: string } | null;
  if (!repoData) {
    // Distinguish this from "no code found": the repo metadata call itself
    // failed (rate limit / transient / 404 / private). See githubGetJson logs
    // above for the specific status.
    console.warn(`[getRepoDNA] Repo metadata fetch failed for ${owner}/${repo} — see status log above.`);
    return null;
  }

  const defaultBranch = repoData.default_branch || "main";

  const treeUrl = `${baseUrl}/git/trees/${defaultBranch}?recursive=1`;
  const treeData = await githubFetchNoCache(treeUrl) as { tree?: TreeEntry[]; truncated?: boolean } | null;
  if (treeData?.truncated) {
    // GitHub caps recursive trees (~100k entries / ~7MB); on a very large repo
    // the tail is dropped and core-file selection may miss real backend code.
    console.warn(`[getRepoDNA] Tree truncated for ${owner}/${repo}; core-file selection may be incomplete.`);
  }
  if (!treeData || !Array.isArray(treeData.tree)) {
    const commitUrl = `${baseUrl}/commits/${defaultBranch}`;
    const commitRes = await githubFetch(commitUrl);
    const sha = commitRes && typeof (commitRes as { sha?: string }).sha === "string" ? (commitRes as { sha: string }).sha : null;
    if (sha) {
      const treeUrlSha = `${baseUrl}/git/trees/${sha}?recursive=1`;
      const treeDataSha = await githubFetchNoCache(treeUrlSha) as { tree?: TreeEntry[] } | null;
      if (treeDataSha && Array.isArray(treeDataSha.tree)) {
        return buildCoreFile(owner, repo, treeDataSha.tree);
      }
    }
    console.warn("[getRepoDNA] No tree for branch:", defaultBranch, owner + "/" + repo);
    return null;
  }

  return buildCoreFile(owner, repo, treeData.tree);
}
