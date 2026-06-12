#!/usr/bin/env node
// scripts/diagnose-signals.mjs
//
// Budget proof + signal inspector for the ESQ v2 "AI-leverage" pipeline
// (lib/github-signals.ts). It walks the SAME two-call sequence the real
// pipeline uses, using the SAME auth (GitHub App installation token if
// configured, else GITHUB_TOKEN PAT), and:
//   - prints the classified status (ok | unavailable | no_evidence)
//   - prints the computed metrics
//   - prints the summaryText (exactly what the LLM would see — NOT code)
//   - prints and ASSERTS the exact count of GitHub API calls used (≤ 2, or
//     ≤ 3 when a bare PROFILE url needs a resolution call).
//
// Dependency-free: runs on plain `node` (no tsx/ts-node). It mirrors the TS
// logic rather than importing it so it works without a build — same convention
// as scripts/diagnose-github.mjs. The counted-fetch wrapper IS the budget
// instrument.
//
// Usage:
//   node scripts/diagnose-signals.mjs <github-url>
//
// Examples:
//   node scripts/diagnose-signals.mjs https://github.com/expressjs/express
//   node scripts/diagnose-signals.mjs https://github.com/torvalds        (profile)
//   node scripts/diagnose-signals.mjs https://github.com/nope/does-not-exist (404)

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REST_API = "https://api.github.com";
const GRAPHQL_API = "https://api.github.com/graphql";

// --- keep these constants in sync with lib/github-signals.ts ---------------
const WALL_CLOCK_BUDGET_MS = 30_000;
const PRISMA_SCHEMA_MIN_BYTES = 1024;
const WORKFLOW_MIN_BYTES = 300;
const PADDING_FILE_MAX_BYTES = 200;
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".swift", ".scala", ".cpp", ".c", ".mjs", ".cjs"];
const MAX_CANDIDATE_FILES = 3;
const MAX_BLOB_BYTES = 200 * 1024;
const MANIFEST_FILES = ["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle"];

// --- env loading (same .env files Next loads) ------------------------------
function loadDotEnvFallback() {
  for (const file of [".env.local", ".env"]) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}
try {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  loadDotEnvFallback();
}

// --- auth (mirrors getGithubAuthHeader in lib/github-utils.ts) -------------
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function signAppJwt(issuer, pem) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: issuer }));
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  return `${data}.${b64url(signer.sign(pem))}`;
}
async function resolveAuthHeader() {
  const issuer = process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_APP_ID;
  const installId = process.env.GITHUB_APP_INSTALLATION_ID;
  const keyRaw = process.env.GITHUB_APP_PRIVATE_KEY ?? process.env.GITHUB_APP_PRVATE_KEY;
  const key = keyRaw ? keyRaw.replace(/\\n/g, "\n") : undefined;
  if (issuer && installId && key) {
    try {
      const jwt = signAppJwt(issuer, key);
      // NOTE: this token-mint call is NOT counted against the signal budget — it
      // is the GitHub App auth handshake, cached in-process in production. The
      // budget counts only data fetches (tree + graphql + optional profile list).
      const res = await fetch(`${REST_API}/app/installations/${encodeURIComponent(installId)}/access_tokens`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (res.ok) {
        const data = await res.json();
        return { mode: "github-app", header: `Bearer ${data.token}` };
      }
    } catch {
      /* fall through */
    }
  }
  if (process.env.GITHUB_TOKEN) return { mode: "pat", header: `token ${process.env.GITHUB_TOKEN}` };
  return { mode: "unauthenticated", header: null };
}

// --- counted fetch (the budget instrument) ---------------------------------
let API_CALLS = 0;
const CALL_LOG = [];
function makeCountedFetch(authHeader) {
  return async (url, init = {}) => {
    API_CALLS++;
    const label = url.startsWith(GRAPHQL_API) ? "POST graphql" : `GET ${url.replace(REST_API, "")}`;
    CALL_LOG.push(label);
    const headers = {
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(init.headers || {}),
    };
    return fetch(url, { ...init, headers });
  };
}

// --- URL parsing (mirrors lib/github-utils.ts) -----------------------------
function normalizeGithubUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
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
function stripDotGit(repo) {
  return repo.replace(/\.git$/i, "");
}
function parseGithubUrl(url) {
  const ssh = String(url || "").trim().match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (ssh) return { owner: ssh[1], repo: stripDotGit(ssh[2]) };
  const u = normalizeGithubUrl(url);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: stripDotGit(parts[1]) };
}
function parseGithubUserUrl(url) {
  const u = normalizeGithubUrl(url);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  return { username: parts[0] };
}

// --- pure helpers (mirror lib/github-signals.ts) ---------------------------
function isCodeFile(path) {
  const p = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => p.endsWith(ext));
}
function dirDepth(path) {
  return path.split("/").filter(Boolean).length - 1;
}
function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}
function percentile(nums, p) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}
const RE_TRYCATCH = /\b(try\s*\{|catch\s*\(|except\b|rescue\b|recover\(\))/g;
const RE_VALIDATION = /\b(zod|joi|yup|validate|schema\.parse|pydantic|assert\b|isValid|sanitize|class-validator)/gi;
const RE_RETRY = /\b(retry|retries|backoff|exponential|maxAttempts|max_attempts|withRetry)\b/gi;
const RE_NULLCHECK = /(===\s*null|!==\s*null|===\s*undefined|!==\s*undefined|\?\?|\?\.|is None|is not None|if not\b|Optional\[)/g;
const RE_FIX_COMMIT = /\b(fix|bug|hotfix|patch|typo|oops|revert|wip|broken|error)\b/i;
function countMatches(re, text) {
  const m = text.match(re);
  return m ? m.length : 0;
}
function scanHardening(content) {
  return {
    trycatch: countMatches(RE_TRYCATCH, content),
    validation: countMatches(RE_VALIDATION, content),
    retry: countMatches(RE_RETRY, content),
    nullcheck: countMatches(RE_NULLCHECK, content),
    loc: content.split("\n").length,
  };
}
function extractDeps(manifestPath, content) {
  const p = manifestPath.toLowerCase();
  try {
    if (p.endsWith("package.json")) {
      const j = JSON.parse(content);
      return [...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})];
    }
    if (p.endsWith("requirements.txt")) {
      return content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/[=<>!~ ]/)[0].trim()).filter(Boolean);
    }
    if (p.endsWith("go.mod")) {
      const deps = [];
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(/^([\w./-]+)\s+v\d/);
        if (m) deps.push(m[1]);
      }
      return deps;
    }
    if (p.endsWith("cargo.toml") || p.endsWith("pyproject.toml")) {
      const deps = [];
      let inDeps = false;
      for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith("[")) {
          inDeps = /dependencies/i.test(line);
          continue;
        }
        if (inDeps) {
          const m = line.match(/^["']?([\w.-]+)["']?\s*=/);
          if (m) deps.push(m[1]);
        }
      }
      return deps;
    }
  } catch {
    /* malformed */
  }
  return [];
}
function selectCandidatePaths(tree) {
  const codeEntries = tree
    .filter((e) => e.type === "blob" && isCodeFile(e.path) && (e.size ?? 0) > PADDING_FILE_MAX_BYTES && (e.size ?? 0) <= MAX_BLOB_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const codePaths = codeEntries.slice(0, MAX_CANDIDATE_FILES).map((e) => e.path);
  let manifestPath = null;
  for (const name of MANIFEST_FILES) {
    const matches = tree
      .filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith(name.toLowerCase()) && (e.size ?? 0) > 0)
      .sort((a, b) => dirDepth(a.path) - dirDepth(b.path));
    if (matches.length > 0) {
      manifestPath = matches[0].path;
      break;
    }
  }
  return { codePaths, manifestPath };
}
function computeMetrics({ tree, repoMeta, commits, blobs, manifestPath }) {
  const blobEntries = tree.filter((e) => e.type === "blob");
  const codeEntries = blobEntries.filter((e) => isCodeFile(e.path));
  const codeSizes = codeEntries.map((e) => e.size ?? 0);
  const allSizes = blobEntries.map((e) => e.size ?? 0);
  const lc = (p) => p.toLowerCase();
  const paths = blobEntries.map((e) => e.path);
  const has = (pred) => paths.some((p) => pred(lc(p)));

  const dir_depth_max = blobEntries.reduce((mx, e) => Math.max(mx, dirDepth(e.path)), 0);
  const has_routes = has((p) => /(^|\/)(routes?|api|controllers?|handlers?|endpoints?)(\/|$)/.test(p) || /route\.(t|j)sx?$/.test(p));
  const has_migrations = has((p) => /(^|\/)migrations?(\/|$)/.test(p) || /\.sql$/.test(p));
  const has_error_pages = has((p) => /(error|not-found|404|500|_error)\.(t|j)sx?$/.test(p) || /(^|\/)error\.(t|j)sx?$/.test(p));
  const has_dockerfile = has((p) => /(^|\/)dockerfile(\.\w+)?$/.test(p) || p.endsWith("docker-compose.yml") || p.endsWith("docker-compose.yaml"));
  const has_ci = blobEntries.some((e) => /\.github\/workflows\/.+\.ya?ml$/.test(lc(e.path)) && (e.size ?? 0) > WORKFLOW_MIN_BYTES);
  const has_prisma_schema = blobEntries.some((e) => /prisma\/schema\.prisma$/.test(lc(e.path)) && (e.size ?? 0) > PRISMA_SCHEMA_MIN_BYTES);
  const has_webhook_route = has((p) => /webhooks?/.test(p) && /route\.(t|j)sx?$|\.(t|j)sx?$|\.py$/.test(p));
  const has_sentry_config = has((p) => /sentry/.test(p) && /\.(t|j)s|\.client\.|\.server\.|config/.test(p));

  const median_file_bytes = median(allSizes);
  const p95_file_bytes = percentile(allSizes, 95);
  const tinyCode = codeSizes.filter((s) => s > 0 && s < PADDING_FILE_MAX_BYTES).length;
  const pct_code_files_under_200b = codeEntries.length > 0 ? Math.round((tinyCode / codeEntries.length) * 100) : 0;

  let trycatch_count = 0, validation_count = 0, retry_count = 0, nullcheck_count = 0, scanned_loc = 0, scanned_files = 0;
  for (const b of blobs) {
    if (manifestPath && b.path === manifestPath) continue;
    const h = scanHardening(b.content);
    trycatch_count += h.trycatch;
    validation_count += h.validation;
    retry_count += h.retry;
    nullcheck_count += h.nullcheck;
    scanned_loc += h.loc;
    scanned_files += 1;
  }
  const hardeningHits = trycatch_count + validation_count + retry_count + nullcheck_count;
  const hardening_density = scanned_loc > 0 ? Math.round((hardeningHits / scanned_loc) * 1000) / 10 : 0;

  let deps_declared = 0, deps_corroborated_in_tree = 0;
  if (manifestPath) {
    const manifestBlob = blobs.find((b) => b.path === manifestPath);
    if (manifestBlob) {
      const deps = extractDeps(manifestPath, manifestBlob.content);
      deps_declared = deps.length;
      const treeText = paths.join("\n").toLowerCase();
      deps_corroborated_in_tree = deps.filter((d) => {
        const leaf = (d.split("/").pop() ?? d).toLowerCase();
        return leaf.length > 2 && treeText.includes(leaf);
      }).length;
    }
  }

  const commits_analyzed = commits.length;
  const authorCounts = new Map();
  for (const c of commits) {
    const key = c.author?.user?.login ?? c.author?.name ?? "unknown";
    authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
  }
  let dominant = 0;
  for (const cnt of authorCounts.values()) dominant = Math.max(dominant, cnt);
  const authorship_share = commits_analyzed > 0 ? Math.round((dominant / commits_analyzed) * 100) / 100 : 0;
  const candidate_is_author = commits_analyzed === 0 ? false : authorship_share >= 0.5;

  const fixCommits = commits.filter((c) => RE_FIX_COMMIT.test(c.message ?? ""));
  const fix_commit_ratio = commits_analyzed > 0 ? Math.round((fixCommits.length / commits_analyzed) * 100) / 100 : 0;

  const dated = commits
    .filter((c) => c.committedDate)
    .map((c) => ({ ...c, t: new Date(c.committedDate).getTime() }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => a.t - b.t);

  let burst_thrash_count = 0;
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1], cur = dated[i];
    if (RE_FIX_COMMIT.test(cur.message ?? "") && RE_FIX_COMMIT.test(prev.message ?? "")) {
      if (cur.t - prev.t < 10 * 60 * 1000) burst_thrash_count++;
    }
  }
  const dayKeys = new Set(dated.map((c) => new Date(c.t).toISOString().slice(0, 10)));
  const distinct_active_days = dayKeys.size;
  const all_in_one_day = distinct_active_days <= 1 && commits_analyzed > 3;
  const createdMs = repoMeta.createdAt ? new Date(repoMeta.createdAt).getTime() : NaN;
  const lastMs = dated.length > 0 ? dated[dated.length - 1].t : NaN;
  const span_days = Number.isFinite(createdMs) && Number.isFinite(lastMs) ? Math.max(0, Math.round((lastMs - createdMs) / 86400000)) : 0;

  let reworkPairs = 0, additionCommits = 0;
  for (let i = 0; i < dated.length; i++) {
    const cur = dated[i];
    if ((cur.additions ?? 0) > 20) {
      additionCommits++;
      const next = dated[i + 1];
      if (next && (next.deletions ?? 0) > 10 && next.t - cur.t < 86400000) reworkPairs++;
    }
  }
  const rework_ratio = additionCommits > 0 ? Math.round((reworkPairs / additionCommits) * 100) / 100 : 0;

  return {
    primary_language: repoMeta.primaryLanguage ?? null,
    created_at: repoMeta.createdAt ?? null,
    pushed_at: repoMeta.pushedAt ?? null,
    is_fork: Boolean(repoMeta.isFork),
    is_template: Boolean(repoMeta.isTemplate),
    total_files: blobEntries.length,
    code_files: codeEntries.length,
    dir_depth_max,
    has_routes, has_migrations, has_error_pages,
    has_dockerfile, has_ci,
    has_prisma_schema, has_webhook_route, has_sentry_config,
    median_file_bytes, p95_file_bytes, pct_code_files_under_200b,
    scanned_files, scanned_loc,
    trycatch_count, validation_count, retry_count, nullcheck_count, hardening_density,
    deps_declared, deps_corroborated_in_tree,
    candidate_is_author, authorship_share, commits_analyzed,
    fix_commit_ratio, burst_thrash_count, distinct_active_days, all_in_one_day, span_days, rework_ratio,
  };
}
function buildSummaryText(m) {
  const yn = (b) => (b ? "yes" : "no");
  const L = [];
  L.push("DETERMINISTIC GITHUB-SIGNAL SUMMARY (metadata + regex counts; NOT source code)", "");
  L.push("Repo:");
  L.push(`- primary_language: ${m.primary_language ?? "unknown"}`);
  L.push(`- created_at: ${m.created_at ?? "unknown"}, last_push: ${m.pushed_at ?? "unknown"}, span_days: ${m.span_days}`);
  L.push(`- is_fork: ${yn(m.is_fork)}, is_template: ${yn(m.is_template)}`, "");
  L.push("Build / architecture:");
  L.push(`- total_files: ${m.total_files}, code_files: ${m.code_files}, max_dir_depth: ${m.dir_depth_max}`);
  L.push(`- routes: ${yn(m.has_routes)}, migrations: ${yn(m.has_migrations)}, error_pages: ${yn(m.has_error_pages)}`);
  L.push(`- dockerfile: ${yn(m.has_dockerfile)}, ci_workflows(>300B): ${yn(m.has_ci)}`);
  L.push(`- prisma_schema(>1KB): ${yn(m.has_prisma_schema)}, webhook_route: ${yn(m.has_webhook_route)}, sentry_config: ${yn(m.has_sentry_config)}`, "");
  L.push("Padding tells:");
  L.push(`- median_file_bytes: ${m.median_file_bytes}, p95_file_bytes: ${m.p95_file_bytes}`);
  L.push(`- pct_code_files_under_200B: ${m.pct_code_files_under_200b}%`, "");
  L.push("Hardening posture (regex over real file content; higher density = more defensive code):");
  L.push(`- scanned_files: ${m.scanned_files}, scanned_loc: ${m.scanned_loc}`);
  L.push(`- try/catch: ${m.trycatch_count}, validation: ${m.validation_count}, retry: ${m.retry_count}, null-checks: ${m.nullcheck_count}`);
  L.push(`- hardening_density: ${m.hardening_density} hits per 100 LOC`);
  L.push(`- deps_declared: ${m.deps_declared}, deps_corroborated_in_tree: ${m.deps_corroborated_in_tree}`, "");
  L.push("Iteration discipline (commit history):");
  L.push(`- commits_analyzed: ${m.commits_analyzed}, candidate_is_author: ${yn(m.candidate_is_author)}, authorship_share: ${m.authorship_share}`);
  L.push(`- fix_commit_ratio: ${m.fix_commit_ratio}, burst_thrash(<10min fixes): ${m.burst_thrash_count}`);
  L.push(`- distinct_active_days: ${m.distinct_active_days}, all_in_one_day: ${yn(m.all_in_one_day)}, rework_ratio: ${m.rework_ratio}`);
  return L.join("\n");
}
function escapeGqlString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function buildGraphqlQuery(owner, repo, paths) {
  const blobFields = paths
    .map((p, i) => `f${i}: object(expression: "HEAD:${escapeGqlString(p)}") { ... on Blob { text byteSize isTruncated } }`)
    .join("\n        ");
  return `query {
  repository(owner: "${escapeGqlString(owner)}", name: "${escapeGqlString(repo)}") {
    createdAt
    pushedAt
    isFork
    isTemplate
    primaryLanguage { name }
    defaultBranchRef { target { ... on Commit { history(first: 100) { nodes { message committedDate additions deletions author { user { login } name } } } } } }
    ${blobFields}
  }
}`;
}
function statusFromHttp(code) {
  if (code === 404) return "no_evidence";
  if (code === 429 || code === 403 || code >= 500) return "unavailable";
  if (code >= 200 && code < 300) return "ok";
  return "no_evidence";
}

// --- the pipeline (mirrors getGithubSignal) --------------------------------
async function getGithubSignal(githubUrl, cf, authHeader) {
  const deadline = Date.now() + WALL_CLOCK_BUDGET_MS;
  const remainingMs = () => deadline - Date.now();
  const noEvidence = () => ({ status: "no_evidence", metrics: null, summaryText: "No GitHub evidence available." });
  const unavailable = () => ({ status: "unavailable", metrics: null, summaryText: "GitHub signal unavailable (rate limit / transient error)." });

  if (!githubUrl || !githubUrl.trim()) return noEvidence();
  if (!authHeader) return unavailable();

  let owner, repo;
  const direct = parseGithubUrl(githubUrl);
  if (direct) {
    owner = direct.owner;
    repo = direct.repo;
  } else {
    const userInfo = parseGithubUserUrl(githubUrl);
    if (!userInfo) return noEvidence();
    try {
      const listRes = await cf(`${REST_API}/users/${encodeURIComponent(userInfo.username)}/repos?per_page=20&sort=updated`, { signal: AbortSignal.timeout(Math.max(1, remainingMs())) });
      if (!listRes.ok) {
        const s = statusFromHttp(listRes.status);
        return s === "unavailable" ? unavailable() : noEvidence();
      }
      const list = await listRes.json();
      const usable = Array.isArray(list) ? list.filter((r) => !r.fork) : [];
      if (usable.length === 0) return noEvidence();
      const chosen = [...usable].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))[0];
      owner = chosen.owner?.login ?? userInfo.username;
      repo = chosen.name;
    } catch {
      return unavailable();
    }
  }

  // Call 1: REST tree at HEAD
  let tree;
  try {
    const treeRes = await cf(`${REST_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`, { signal: AbortSignal.timeout(Math.max(1, remainingMs())) });
    if (!treeRes.ok) {
      const s = statusFromHttp(treeRes.status);
      return s === "unavailable" ? unavailable() : noEvidence();
    }
    const treeJson = await treeRes.json();
    tree = Array.isArray(treeJson.tree) ? treeJson.tree : [];
  } catch {
    return unavailable();
  }
  if (tree.length === 0) return noEvidence();

  const { codePaths, manifestPath } = selectCandidatePaths(tree);
  const blobPaths = [...codePaths];
  if (manifestPath && !blobPaths.includes(manifestPath)) blobPaths.push(manifestPath);

  // Call 2: GraphQL (metadata + history + blobs)
  let repoMeta = {}, commits = [];
  const blobs = [];
  try {
    const query = buildGraphqlQuery(owner, repo, blobPaths);
    const gqlRes = await cf(GRAPHQL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(Math.max(1, remainingMs())),
    });
    if (!gqlRes.ok) {
      const s = statusFromHttp(gqlRes.status);
      return s === "unavailable" ? unavailable() : noEvidence();
    }
    const gqlJson = await gqlRes.json();
    const r = gqlJson.data?.repository;
    if (!r) return noEvidence();
    repoMeta = { createdAt: r.createdAt, pushedAt: r.pushedAt, isFork: r.isFork, isTemplate: r.isTemplate, primaryLanguage: r.primaryLanguage?.name ?? null };
    commits = r.defaultBranchRef?.target?.history?.nodes ?? [];
    for (let i = 0; i < blobPaths.length; i++) {
      const blob = r[`f${i}`];
      if (blob && typeof blob.text === "string" && !blob.isTruncated) blobs.push({ path: blobPaths[i], content: blob.text });
    }
  } catch {
    return unavailable();
  }

  if ((repoMeta.isFork || repoMeta.isTemplate) && commits.length === 0) return noEvidence();
  const metrics = computeMetrics({ tree, repoMeta, commits, blobs, manifestPath });
  if (repoMeta.isFork && !metrics.candidate_is_author && metrics.commits_analyzed > 0) return noEvidence();
  return { status: "ok", metrics, summaryText: buildSummaryText(metrics) };
}

// --- run -------------------------------------------------------------------
async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node scripts/diagnose-signals.mjs <github-url>");
    process.exit(1);
  }
  console.log(`\nESQ v2 signal diagnostic for: ${url}\n${"=".repeat(64)}`);

  const auth = await resolveAuthHeader();
  console.log(`\n[auth] mode: ${auth.mode}${auth.header ? "" : " (NO TOKEN — GraphQL will 401 → status=unavailable)"}`);

  // Budget rule: a repo URL allows ≤2 data calls; a bare PROFILE url allows ≤3
  // (one extra resolution call).
  const isProfile = !parseGithubUrl(url) && !!parseGithubUserUrl(url);
  const budget = isProfile ? 3 : 2;

  const cf = makeCountedFetch(auth.header);
  const signal = await getGithubSignal(url, cf, auth.header);

  console.log(`\n[status] ${signal.status}`);

  console.log(`\n[metrics]`);
  console.log(signal.metrics ? JSON.stringify(signal.metrics, null, 2) : "  (none — no metrics for this status)");

  console.log(`\n[summaryText] (exactly what the LLM would see — NOT code)\n${"-".repeat(64)}`);
  console.log(signal.summaryText);
  console.log("-".repeat(64));

  console.log(`\n[budget] GitHub API calls used: ${API_CALLS} (limit ${budget}${isProfile ? ", profile url" : ""})`);
  CALL_LOG.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));

  if (API_CALLS > budget) {
    console.error(`\n✗ BUDGET EXCEEDED: ${API_CALLS} > ${budget}`);
    process.exit(2);
  }
  console.log(`\n✓ Budget OK (${API_CALLS} ≤ ${budget})`);
  console.log("");
}

main().catch((e) => {
  console.error("diagnose-signals crashed:", e);
  process.exit(1);
});
