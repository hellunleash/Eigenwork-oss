const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function githubFetch(url: string): Promise<Record<string, unknown> | null> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) {
    (headers as Record<string, string>)["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) {
    if (res.status === 403) {
      const body = await res.text();
      const rateLimited = /rate limit|rate_limit/i.test(body);
      console.warn("[getRepoDNA] GitHub API 403:", rateLimited ? "rate limit" : "forbidden", url.split("?")[0]);
    } else {
      console.warn("[getRepoDNA] GitHub API failed:", res.status, url.split("?")[0]);
    }
    return null;
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Fetch GitHub data without using Next.js data cache (for large JSON responses like git trees). */
async function githubFetchNoCache(url: string): Promise<Record<string, unknown> | null> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) {
    (headers as Record<string, string>)["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    console.warn("[getRepoDNA] GitHub API (no-cache) failed:", res.status, url.split("?")[0]);
    return null;
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Fetch GitHub blob URL without Next.js cache (blobs can be >2MB; Next cache limit is 2MB). */
async function githubFetchBlob(url: string): Promise<Record<string, unknown> | null> {
  const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };
  if (GITHUB_TOKEN) {
    (headers as Record<string, string>)["Authorization"] = `token ${GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== "github.com") return null;
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/** Returns { username } for profile URLs like https://github.com/waifuexists */
function parseGithubUserUrl(url: string): { username: string } | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== "github.com") return null;
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    return { username: parts[0] };
  } catch {
    return null;
  }
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
  if (!repoData) return null;

  const defaultBranch = repoData.default_branch || "main";

  const treeUrl = `${baseUrl}/git/trees/${defaultBranch}?recursive=1`;
  const treeData = await githubFetchNoCache(treeUrl) as { tree?: TreeEntry[] } | null;
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
