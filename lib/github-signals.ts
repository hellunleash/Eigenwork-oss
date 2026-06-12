// ---------------------------------------------------------------------------
// lib/github-signals.ts — ESQ v2 "AI-leverage" signal (junior track)
// ---------------------------------------------------------------------------
// Replaces the brittle getRepoDNA → core-file → LLM-reads-code path with a
// DETERMINISTIC metadata + regex signal. Source code is NEVER sent to an LLM:
// the regex hardening scan runs CPU-only here, and only a short human-readable
// `summaryText` digest (counts + metadata) is handed to the junior-esq prompt.
//
// HARD BUDGET: exactly 2 GitHub API calls per candidate.
//   Call 1 — REST  GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1
//            (HEAD resolves the default branch with no metadata pre-call)
//   Call 2 — ONE GraphQL request batching: repo metadata + commit history +
//            aliased blob fetches for the selected candidate files + manifest.
// A bare PROFILE url may cost at most 1 EXTRA resolution call (list repos).
//
// Auth: reuses getGithubAuthHeader from lib/github-utils.ts (GitHub App
// installation token, else GITHUB_TOKEN PAT). GraphQL REQUIRES auth.
//
// The whole pipeline is wrapped in a hard 30s wall-clock budget.
// ---------------------------------------------------------------------------

import {
  getGithubAuthHeader,
  parseGithubUrl,
  parseGithubUserUrl,
} from "@/lib/github-utils";

const REST_API = "https://api.github.com";
const GRAPHQL_API = "https://api.github.com/graphql";

// Hard wall-clock budget for the whole signal pipeline.
const WALL_CLOCK_BUDGET_MS = 30_000;

// Size gates: empty-file padding must not earn integration credit.
const PRISMA_SCHEMA_MIN_BYTES = 1024; // prisma/schema.prisma > 1KB
const WORKFLOW_MIN_BYTES = 300; // .github/workflows/*.yml > 300B
const PADDING_FILE_MAX_BYTES = 200; // code files < 200B count as padding

// Candidate code-file selection.
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".swift", ".scala", ".cpp", ".c", ".mjs", ".cjs"];
const MAX_CANDIDATE_FILES = 3; // 2–3 largest code files
const MAX_BLOB_BYTES = 200 * 1024; // don't request blobs above this (GraphQL truncates anyway)

// Manifests we corroborate the dep-vs-tree signal against.
const MANIFEST_FILES = ["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle"];

export type EsqSignalStatus = "ok" | "unavailable" | "no_evidence";

export type GithubSignalMetrics = {
  // Repo metadata
  primary_language: string | null;
  created_at: string | null;
  pushed_at: string | null;
  is_fork: boolean;
  is_template: boolean;
  // Architecture / completeness (from tree)
  total_files: number;
  code_files: number;
  dir_depth_max: number;
  has_routes: boolean;
  has_migrations: boolean;
  has_error_pages: boolean;
  // Infra
  has_dockerfile: boolean;
  has_ci: boolean;
  // Integration artifacts (size-gated)
  has_prisma_schema: boolean;
  has_webhook_route: boolean;
  has_sentry_config: boolean;
  // Padding tells
  median_file_bytes: number;
  p95_file_bytes: number;
  pct_code_files_under_200b: number;
  // Hardening (regex on real content, CPU-only — never sent to an LLM)
  scanned_files: number;
  scanned_loc: number;
  trycatch_count: number;
  validation_count: number;
  retry_count: number;
  nullcheck_count: number;
  hardening_density: number; // hardening hits per 100 LOC
  // Dependency corroboration
  deps_declared: number;
  deps_corroborated_in_tree: number;
  // Authorship + iteration
  candidate_is_author: boolean;
  authorship_share: number; // fraction of commits by the dominant author
  commits_analyzed: number;
  fix_commit_ratio: number;
  burst_thrash_count: number; // fix-commits < 10 min apart
  distinct_active_days: number;
  all_in_one_day: boolean;
  span_days: number; // createdAt → last commit
  rework_ratio: number; // deletions shortly after additions
};

export type GithubSignal = {
  status: EsqSignalStatus;
  metrics: GithubSignalMetrics | null;
  summaryText: string;
  // Diagnostics (not persisted): how many GitHub API calls were spent.
  apiCalls: number;
};

type FetchFn = typeof fetch;

// ---------------------------------------------------------------------------
// Tree types
// ---------------------------------------------------------------------------
type TreeEntry = { path: string; type: string; size?: number };

// ---------------------------------------------------------------------------
// Helpers — classification (pure, exported for the diagnostic script's parity)
// ---------------------------------------------------------------------------

function isCodeFile(path: string): boolean {
  const p = path.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

function dirDepth(path: string): number {
  return path.split("/").filter(Boolean).length - 1;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

// ---------------------------------------------------------------------------
// Regex hardening scan — runs on REAL file content, CPU-only, NEVER sent to LLM.
// Counts defensive-programming signals to derive hardening_density.
// ---------------------------------------------------------------------------
const RE_TRYCATCH = /\b(try\s*\{|catch\s*\(|except\b|rescue\b|recover\(\))/g;
const RE_VALIDATION = /\b(zod|joi|yup|validate|schema\.parse|pydantic|assert\b|isValid|sanitize|class-validator)/gi;
const RE_RETRY = /\b(retry|retries|backoff|exponential|maxAttempts|max_attempts|withRetry)\b/gi;
const RE_NULLCHECK = /(===\s*null|!==\s*null|===\s*undefined|!==\s*undefined|\?\?|\?\.|is None|is not None|if not\b|Optional\[)/g;

function countMatches(re: RegExp, text: string): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

export type HardeningCounts = {
  trycatch: number;
  validation: number;
  retry: number;
  nullcheck: number;
  loc: number;
};

export function scanHardening(content: string): HardeningCounts {
  const loc = content.split("\n").length;
  return {
    trycatch: countMatches(RE_TRYCATCH, content),
    validation: countMatches(RE_VALIDATION, content),
    retry: countMatches(RE_RETRY, content),
    nullcheck: countMatches(RE_NULLCHECK, content),
    loc,
  };
}

// ---------------------------------------------------------------------------
// Dependency extraction from a manifest blob (corroboration vs tree).
// ---------------------------------------------------------------------------
function extractDeps(manifestPath: string, content: string): string[] {
  const p = manifestPath.toLowerCase();
  try {
    if (p.endsWith("package.json")) {
      const j = JSON.parse(content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      return [...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})];
    }
    if (p.endsWith("requirements.txt")) {
      return content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(/[=<>!~ ]/)[0].trim())
        .filter(Boolean);
    }
    if (p.endsWith("go.mod")) {
      const deps: string[] = [];
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(/^([\w./-]+)\s+v\d/);
        if (m) deps.push(m[1]);
      }
      return deps;
    }
    if (p.endsWith("cargo.toml") || p.endsWith("pyproject.toml")) {
      const deps: string[] = [];
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
    /* malformed manifest → no deps */
  }
  return [];
}

// ---------------------------------------------------------------------------
// GraphQL response shape (loosely typed; we defensively read each field)
// ---------------------------------------------------------------------------
type GqlCommit = {
  message?: string;
  committedDate?: string;
  additions?: number;
  deletions?: number;
  author?: { user?: { login?: string } | null; name?: string | null } | null;
};

// ---------------------------------------------------------------------------
// Metric computation from the two responses (pure given inputs).
// ---------------------------------------------------------------------------

const RE_FIX_COMMIT = /\b(fix|bug|hotfix|patch|typo|oops|revert|wip|broken|error)\b/i;

function computeMetrics(args: {
  tree: TreeEntry[];
  repoMeta: {
    createdAt?: string;
    pushedAt?: string;
    isFork?: boolean;
    isTemplate?: boolean;
    primaryLanguage?: string | null;
  };
  commits: GqlCommit[];
  blobs: { path: string; content: string }[];
  manifestPath: string | null;
}): GithubSignalMetrics {
  const { tree, repoMeta, commits, blobs, manifestPath } = args;

  const blobEntries = tree.filter((e) => e.type === "blob");
  const codeEntries = blobEntries.filter((e) => isCodeFile(e.path));
  const codeSizes = codeEntries.map((e) => e.size ?? 0);
  const allSizes = blobEntries.map((e) => e.size ?? 0);

  const lc = (p: string) => p.toLowerCase();
  const paths = blobEntries.map((e) => e.path);

  const has = (pred: (p: string) => boolean) => paths.some((p) => pred(lc(p)));

  // Architecture / completeness
  const dir_depth_max = blobEntries.reduce((mx, e) => Math.max(mx, dirDepth(e.path)), 0);
  const has_routes = has(
    (p) => /(^|\/)(routes?|api|controllers?|handlers?|endpoints?)(\/|$)/.test(p) || /route\.(t|j)sx?$/.test(p)
  );
  const has_migrations = has((p) => /(^|\/)migrations?(\/|$)/.test(p) || /\.sql$/.test(p));
  const has_error_pages = has(
    (p) => /(error|not-found|404|500|_error)\.(t|j)sx?$/.test(p) || /(^|\/)error\.(t|j)sx?$/.test(p)
  );

  // Infra
  const has_dockerfile = has((p) => /(^|\/)dockerfile(\.\w+)?$/.test(p) || p.endsWith("docker-compose.yml") || p.endsWith("docker-compose.yaml"));
  // CI workflow files must clear the size gate (empty stub files don't count).
  const has_ci = blobEntries.some(
    (e) => /\.github\/workflows\/.+\.ya?ml$/.test(lc(e.path)) && (e.size ?? 0) > WORKFLOW_MIN_BYTES
  );

  // Integration artifacts (SIZE-GATED — padding doesn't count)
  const has_prisma_schema = blobEntries.some(
    (e) => /prisma\/schema\.prisma$/.test(lc(e.path)) && (e.size ?? 0) > PRISMA_SCHEMA_MIN_BYTES
  );
  const has_webhook_route = has((p) => /webhooks?/.test(p) && /route\.(t|j)sx?$|\.(t|j)sx?$|\.py$/.test(p));
  const has_sentry_config = has((p) => /sentry/.test(p) && /\.(t|j)s|\.client\.|\.server\.|config/.test(p));

  // Padding tells
  const median_file_bytes = median(allSizes);
  const p95_file_bytes = percentile(allSizes, 95);
  const tinyCode = codeSizes.filter((s) => s > 0 && s < PADDING_FILE_MAX_BYTES).length;
  const pct_code_files_under_200b = codeEntries.length > 0 ? Math.round((tinyCode / codeEntries.length) * 100) : 0;

  // Hardening (regex over real blob content)
  let trycatch_count = 0;
  let validation_count = 0;
  let retry_count = 0;
  let nullcheck_count = 0;
  let scanned_loc = 0;
  let scanned_files = 0;
  for (const b of blobs) {
    if (manifestPath && b.path === manifestPath) continue; // don't scan the manifest
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

  // Dependency corroboration
  let deps_declared = 0;
  let deps_corroborated_in_tree = 0;
  if (manifestPath) {
    const manifestBlob = blobs.find((b) => b.path === manifestPath);
    if (manifestBlob) {
      const deps = extractDeps(manifestPath, manifestBlob.content);
      deps_declared = deps.length;
      const treeText = paths.join("\n").toLowerCase();
      // crude corroboration: dep name (or its leaf) appears somewhere in tree paths
      deps_corroborated_in_tree = deps.filter((d) => {
        const leaf = d.split("/").pop()?.toLowerCase() ?? d.toLowerCase();
        return leaf.length > 2 && treeText.includes(leaf);
      }).length;
    }
  }

  // Authorship + iteration (from commit history)
  const commits_analyzed = commits.length;
  const authorCounts = new Map<string, number>();
  for (const c of commits) {
    const key = c.author?.user?.login ?? c.author?.name ?? "unknown";
    authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
  }
  let dominantAuthorShare = 0;
  for (const cnt of authorCounts.values()) {
    dominantAuthorShare = Math.max(dominantAuthorShare, cnt);
  }
  const authorship_share = commits_analyzed > 0 ? Math.round((dominantAuthorShare / commits_analyzed) * 100) / 100 : 0;
  // Candidate authorship: dominant author owns the clear majority of history.
  const candidate_is_author = commits_analyzed === 0 ? false : authorship_share >= 0.5;

  // Fix-commit ratio
  const fixCommits = commits.filter((c) => RE_FIX_COMMIT.test(c.message ?? ""));
  const fix_commit_ratio = commits_analyzed > 0 ? Math.round((fixCommits.length / commits_analyzed) * 100) / 100 : 0;

  // Timeline-ordered (oldest → newest) for cadence/thrash/rework.
  const dated = commits
    .filter((c) => c.committedDate)
    .map((c) => ({ ...c, t: new Date(c.committedDate as string).getTime() }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => a.t - b.t);

  // Burst-thrash: consecutive FIX commits < 10 min apart.
  let burst_thrash_count = 0;
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const cur = dated[i];
    if (RE_FIX_COMMIT.test(cur.message ?? "") && RE_FIX_COMMIT.test(prev.message ?? "")) {
      if (cur.t - prev.t < 10 * 60 * 1000) burst_thrash_count++;
    }
  }

  // Cadence realism: distinct active days, all-in-one-day, span vs createdAt.
  const dayKeys = new Set(dated.map((c) => new Date(c.t).toISOString().slice(0, 10)));
  const distinct_active_days = dayKeys.size;
  const all_in_one_day = distinct_active_days <= 1 && commits_analyzed > 3;
  const createdMs = repoMeta.createdAt ? new Date(repoMeta.createdAt).getTime() : NaN;
  const lastMs = dated.length > 0 ? dated[dated.length - 1].t : NaN;
  const span_days =
    Number.isFinite(createdMs) && Number.isFinite(lastMs)
      ? Math.max(0, Math.round((lastMs - createdMs) / (24 * 60 * 60 * 1000)))
      : 0;

  // Rework ratio: deletions shortly (<24h) after a sizable addition commit.
  let reworkPairs = 0;
  let additionCommits = 0;
  for (let i = 0; i < dated.length; i++) {
    const cur = dated[i];
    if ((cur.additions ?? 0) > 20) {
      additionCommits++;
      const next = dated[i + 1];
      if (next && (next.deletions ?? 0) > 10 && next.t - cur.t < 24 * 60 * 60 * 1000) {
        reworkPairs++;
      }
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
    has_routes,
    has_migrations,
    has_error_pages,
    has_dockerfile,
    has_ci,
    has_prisma_schema,
    has_webhook_route,
    has_sentry_config,
    median_file_bytes,
    p95_file_bytes,
    pct_code_files_under_200b,
    scanned_files,
    scanned_loc,
    trycatch_count,
    validation_count,
    retry_count,
    nullcheck_count,
    hardening_density,
    deps_declared,
    deps_corroborated_in_tree,
    candidate_is_author,
    authorship_share,
    commits_analyzed,
    fix_commit_ratio,
    burst_thrash_count,
    distinct_active_days,
    all_in_one_day,
    span_days,
    rework_ratio,
  };
}

// ---------------------------------------------------------------------------
// Candidate-file + manifest selection from the tree.
// Selects the 2–3 LARGEST code files plus the first matching manifest path.
// ---------------------------------------------------------------------------
export function selectCandidatePaths(tree: TreeEntry[]): { codePaths: string[]; manifestPath: string | null } {
  const codeEntries = tree
    .filter((e) => e.type === "blob" && isCodeFile(e.path) && (e.size ?? 0) > PADDING_FILE_MAX_BYTES && (e.size ?? 0) <= MAX_BLOB_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const codePaths = codeEntries.slice(0, MAX_CANDIDATE_FILES).map((e) => e.path);

  let manifestPath: string | null = null;
  for (const name of MANIFEST_FILES) {
    // Prefer a root-level manifest; otherwise the shallowest one.
    const matches = tree
      .filter((e) => e.type === "blob" && e.path.toLowerCase().endsWith(name) && (e.size ?? 0) > 0)
      .sort((a, b) => dirDepth(a.path) - dirDepth(b.path));
    if (matches.length > 0) {
      manifestPath = matches[0].path;
      break;
    }
  }
  return { codePaths, manifestPath };
}

// ---------------------------------------------------------------------------
// Summary text — the ONLY thing the LLM sees. Counts + metadata, never code.
// ---------------------------------------------------------------------------
export function buildSummaryText(m: GithubSignalMetrics): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  const lines: string[] = [];
  lines.push("DETERMINISTIC GITHUB-SIGNAL SUMMARY (metadata + regex counts; NOT source code)");
  lines.push("");
  lines.push("Repo:");
  lines.push(`- primary_language: ${m.primary_language ?? "unknown"}`);
  lines.push(`- created_at: ${m.created_at ?? "unknown"}, last_push: ${m.pushed_at ?? "unknown"}, span_days: ${m.span_days}`);
  lines.push(`- is_fork: ${yn(m.is_fork)}, is_template: ${yn(m.is_template)}`);
  lines.push("");
  lines.push("Build / architecture:");
  lines.push(`- total_files: ${m.total_files}, code_files: ${m.code_files}, max_dir_depth: ${m.dir_depth_max}`);
  lines.push(`- routes: ${yn(m.has_routes)}, migrations: ${yn(m.has_migrations)}, error_pages: ${yn(m.has_error_pages)}`);
  lines.push(`- dockerfile: ${yn(m.has_dockerfile)}, ci_workflows(>300B): ${yn(m.has_ci)}`);
  lines.push(`- prisma_schema(>1KB): ${yn(m.has_prisma_schema)}, webhook_route: ${yn(m.has_webhook_route)}, sentry_config: ${yn(m.has_sentry_config)}`);
  lines.push("");
  lines.push("Padding tells:");
  lines.push(`- median_file_bytes: ${m.median_file_bytes}, p95_file_bytes: ${m.p95_file_bytes}`);
  lines.push(`- pct_code_files_under_200B: ${m.pct_code_files_under_200b}%`);
  lines.push("");
  lines.push("Hardening posture (regex over real file content; higher density = more defensive code):");
  lines.push(`- scanned_files: ${m.scanned_files}, scanned_loc: ${m.scanned_loc}`);
  lines.push(`- try/catch: ${m.trycatch_count}, validation: ${m.validation_count}, retry: ${m.retry_count}, null-checks: ${m.nullcheck_count}`);
  lines.push(`- hardening_density: ${m.hardening_density} hits per 100 LOC`);
  lines.push(`- deps_declared: ${m.deps_declared}, deps_corroborated_in_tree: ${m.deps_corroborated_in_tree}`);
  lines.push("");
  lines.push("Iteration discipline (commit history):");
  lines.push(`- commits_analyzed: ${m.commits_analyzed}, candidate_is_author: ${yn(m.candidate_is_author)}, authorship_share: ${m.authorship_share}`);
  lines.push(`- fix_commit_ratio: ${m.fix_commit_ratio}, burst_thrash(<10min fixes): ${m.burst_thrash_count}`);
  lines.push(`- distinct_active_days: ${m.distinct_active_days}, all_in_one_day: ${yn(m.all_in_one_day)}, rework_ratio: ${m.rework_ratio}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// GraphQL query builder. ONE request batches metadata + history + blobs.
// ---------------------------------------------------------------------------
function buildGraphqlQuery(owner: string, repo: string, paths: string[]): string {
  // Aliased blob objects: HEAD:<path>. Aliases must be valid GraphQL names.
  const blobFields = paths
    .map((p, i) => `f${i}: object(expression: "HEAD:${escapeGqlExpr(p)}") { ... on Blob { text byteSize isTruncated } }`)
    .join("\n        ");
  return `query {
  repository(owner: "${escapeGqlString(owner)}", name: "${escapeGqlString(repo)}") {
    createdAt
    pushedAt
    isFork
    isTemplate
    primaryLanguage { name }
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100) {
            nodes {
              message
              committedDate
              additions
              deletions
              author { user { login } name }
            }
          }
        }
      }
    }
    ${blobFields}
  }
}`;
}

function escapeGqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function escapeGqlExpr(s: string): string {
  // Path goes inside an expression string literal; same escaping as a GQL string.
  return escapeGqlString(s);
}

// ---------------------------------------------------------------------------
// Status classification for fetch outcomes.
// ---------------------------------------------------------------------------
function statusFromHttp(code: number): "unavailable" | "no_evidence" | "ok" {
  if (code === 404) return "no_evidence";
  if (code === 429) return "unavailable";
  if (code === 403) return "unavailable"; // rate-limit/abuse forbidden
  if (code >= 500) return "unavailable";
  if (code >= 200 && code < 300) return "ok";
  return "no_evidence"; // other 4xx → treat as absent
}

// ---------------------------------------------------------------------------
// Main entry — getGithubSignal
// ---------------------------------------------------------------------------
export async function getGithubSignal(
  githubUrl: string | null | undefined,
  opts?: { fetchImpl?: FetchFn; onApiCall?: () => void }
): Promise<GithubSignal> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let apiCalls = 0;
  const tick = () => {
    apiCalls++;
    opts?.onApiCall?.();
  };

  const noEvidence = (): GithubSignal => ({ status: "no_evidence", metrics: null, summaryText: "No GitHub evidence available.", apiCalls });
  const unavailable = (): GithubSignal => ({ status: "unavailable", metrics: null, summaryText: "GitHub signal unavailable (rate limit / transient error).", apiCalls });

  if (!githubUrl || typeof githubUrl !== "string" || !githubUrl.trim()) {
    return noEvidence();
  }

  const deadline = Date.now() + WALL_CLOCK_BUDGET_MS;
  const remainingMs = () => deadline - Date.now();

  const authHeader = await getGithubAuthHeader();
  // GraphQL REQUIRES auth. Without a token we cannot honor the 2-call budget
  // (REST tree could work unauth, but GraphQL would 401) — classify as
  // unavailable so the caller renormalizes rather than zeroing a real repo.
  if (!authHeader) {
    return unavailable();
  }

  // Resolve to a repo. A repo URL costs 0 extra calls; a bare profile URL may
  // cost AT MOST 1 extra resolution call (list public repos).
  let owner: string;
  let repo: string;
  const direct = parseGithubUrl(githubUrl);
  if (direct) {
    owner = direct.owner;
    repo = direct.repo;
  } else {
    const userInfo = parseGithubUserUrl(githubUrl);
    if (!userInfo) return noEvidence();
    try {
      tick(); // EXTRA resolution call (profile URL only)
      const listRes = await fetchImpl(
        `${REST_API}/users/${encodeURIComponent(userInfo.username)}/repos?per_page=20&sort=updated`,
        { headers: restHeaders(authHeader), signal: AbortSignal.timeout(Math.max(1, remainingMs())) }
      );
      if (!listRes.ok) {
        const s = statusFromHttp(listRes.status);
        return s === "unavailable" ? unavailable() : noEvidence();
      }
      const list = (await listRes.json()) as Array<{ name: string; owner?: { login?: string }; fork?: boolean; stargazers_count?: number }>;
      const usable = Array.isArray(list) ? list.filter((r) => !r.fork) : [];
      if (usable.length === 0) return noEvidence(); // empty profile / forks-only
      const chosen = [...usable].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))[0];
      owner = chosen.owner?.login ?? userInfo.username;
      repo = chosen.name;
    } catch {
      return unavailable();
    }
  }

  // --- Call 1: REST git tree at HEAD (resolves default branch implicitly) ---
  let tree: TreeEntry[];
  try {
    tick();
    const treeRes = await fetchImpl(
      `${REST_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`,
      { headers: restHeaders(authHeader), signal: AbortSignal.timeout(Math.max(1, remainingMs())) }
    );
    if (!treeRes.ok) {
      const s = statusFromHttp(treeRes.status);
      return s === "unavailable" ? unavailable() : noEvidence();
    }
    const treeJson = (await treeRes.json()) as { tree?: TreeEntry[] };
    tree = Array.isArray(treeJson.tree) ? treeJson.tree : [];
  } catch {
    return unavailable();
  }

  if (tree.length === 0) return noEvidence(); // empty repo

  const { codePaths, manifestPath } = selectCandidatePaths(tree);
  const blobPaths = [...codePaths];
  if (manifestPath && !blobPaths.includes(manifestPath)) blobPaths.push(manifestPath);

  // --- Call 2: single GraphQL request (metadata + history + blobs) ---
  let repoMeta: {
    createdAt?: string;
    pushedAt?: string;
    isFork?: boolean;
    isTemplate?: boolean;
    primaryLanguage?: string | null;
  } = {};
  let commits: GqlCommit[] = [];
  const blobs: { path: string; content: string }[] = [];
  try {
    tick();
    const query = buildGraphqlQuery(owner, repo, blobPaths);
    const gqlRes = await fetchImpl(GRAPHQL_API, {
      method: "POST",
      headers: { ...restHeaders(authHeader), "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(Math.max(1, remainingMs())),
    });
    if (!gqlRes.ok) {
      const s = statusFromHttp(gqlRes.status);
      return s === "unavailable" ? unavailable() : noEvidence();
    }
    const gqlJson = (await gqlRes.json()) as {
      data?: {
        repository?: {
          createdAt?: string;
          pushedAt?: string;
          isFork?: boolean;
          isTemplate?: boolean;
          primaryLanguage?: { name?: string } | null;
          defaultBranchRef?: { target?: { history?: { nodes?: GqlCommit[] } } } | null;
          [k: string]: unknown;
        } | null;
      };
      errors?: unknown;
    };
    const r = gqlJson.data?.repository;
    if (!r) {
      // GraphQL returned errors but HTTP 200 (e.g. NOT_FOUND on private/renamed).
      return noEvidence();
    }
    repoMeta = {
      createdAt: r.createdAt,
      pushedAt: r.pushedAt,
      isFork: r.isFork,
      isTemplate: r.isTemplate,
      primaryLanguage: r.primaryLanguage?.name ?? null,
    };
    commits = r.defaultBranchRef?.target?.history?.nodes ?? [];
    // Collect aliased blobs f0..fN back to their original paths.
    for (let i = 0; i < blobPaths.length; i++) {
      const blob = r[`f${i}`] as { text?: string; isTruncated?: boolean } | null | undefined;
      if (blob && typeof blob.text === "string" && !blob.isTruncated) {
        blobs.push({ path: blobPaths[i], content: blob.text });
      }
    }
  } catch {
    return unavailable();
  }

  // Fork/template with no real authored work → no_evidence (don't reward boilerplate).
  if ((repoMeta.isFork || repoMeta.isTemplate) && commits.length === 0) {
    return noEvidence();
  }

  const metrics = computeMetrics({ tree, repoMeta, commits, blobs, manifestPath });

  // Fork-only with no candidate authorship → no_evidence.
  if (repoMeta.isFork && !metrics.candidate_is_author && metrics.commits_analyzed > 0) {
    return noEvidence();
  }

  const summaryText = buildSummaryText(metrics);
  return { status: "ok", metrics, summaryText, apiCalls };
}

function restHeaders(authHeader: string): Record<string, string> {
  return {
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: authHeader,
  };
}
