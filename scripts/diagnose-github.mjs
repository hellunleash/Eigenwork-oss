#!/usr/bin/env node
// scripts/diagnose-github.mjs
//
// Diagnose why getRepoDNA (lib/github-utils.ts) succeeds on some repos and
// fails on others ("dice roll"). It walks the SAME steps the extractor does and
// prints the outcome of each, using the SAME auth the app uses (GitHub App
// installation token if configured, else GITHUB_TOKEN PAT, else unauthenticated).
//
// Dependency-free: runs on plain `node` (no tsx/ts-node). It re-implements the
// steps rather than importing the TS lib so it works without a build.
//
// Usage:
//   node scripts/diagnose-github.mjs <github-url>
//   npm run diagnose:github -- <github-url>
//
// Example:
//   node scripts/diagnose-github.mjs https://github.com/AbdulRehman-z/typescript-ecommerce-backend
//
// Prints, in order:
//   1. Which auth mode resolved (no secrets leaked)
//   2. /rate_limit — your real quota + remaining (unauth caps at 60/hr — the #1 dice-roll cause)
//   3. URL parse result (owner/repo)
//   4. repo metadata (status, default_branch)
//   5. git tree (status, truncated?, total entries, backend-code file count)
//   6. A verdict: where getRepoDNA would have returned null, and the likely cause.

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.github.com";
const BACKEND_EXTENSIONS = [".ts", ".js", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".swift"];

// --- env loading (same .env files Next loads) ------------------------------
// Prefer @next/env (handles quoting exactly like the app). If it isn't
// resolvable (e.g. run outside an installed tree), fall back to a minimal
// .env.local/.env parser. Single-line `KEY="...\n..."` PEM values work because
// the App-key normalizer below turns literal "\n" into newlines, matching
// lib/github-utils.ts.
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

const PASS = "  ✓";
const FAIL = "  ✗";
const INFO = "  •";

// --- auth resolution (mirrors getGithubAuthHeader in lib/github-utils.ts) ---
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

async function resolveAuth() {
  const issuer = process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_APP_ID;
  const installId = process.env.GITHUB_APP_INSTALLATION_ID;
  const keyRaw = process.env.GITHUB_APP_PRIVATE_KEY ?? process.env.GITHUB_APP_PRVATE_KEY;
  const key = keyRaw ? keyRaw.replace(/\\n/g, "\n") : undefined;

  if (issuer && installId && key) {
    try {
      const jwt = signAppJwt(issuer, key);
      const res = await fetch(`${API}/app/installations/${encodeURIComponent(installId)}/access_tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { mode: "github-app", header: null, error: `installation token failed: ${res.status} ${body.slice(0, 160)}` };
      }
      const data = await res.json();
      return { mode: "github-app", header: `Bearer ${data.token}`, expiresAt: data.expires_at };
    } catch (e) {
      return { mode: "github-app", header: null, error: String(e) };
    }
  }
  if (process.env.GITHUB_TOKEN) return { mode: "pat", header: `token ${process.env.GITHUB_TOKEN}` };
  return { mode: "unauthenticated", header: null };
}

let AUTH_HEADER = null;

async function ghGet(path) {
  const headers = { Accept: "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (AUTH_HEADER) headers.Authorization = AUTH_HEADER;
  try {
    const res = await fetch(`${API}${path}`, { headers });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, ok: res.ok, json, headers: res.headers };
  } catch (e) {
    return { status: 0, ok: false, json: null, networkError: String(e) };
  }
}

// --- URL parsing (mirrors parseGithubUrl in lib/github-utils.ts) -----------
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
function parseRepo(url) {
  const ssh = String(url || "").trim().match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (ssh) return { owner: ssh[1], repo: stripDotGit(ssh[2]), kind: "repo (ssh)" };
  const u = normalizeGithubUrl(url);
  if (!u) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: stripDotGit(parts[1]), kind: "repo" };
  if (parts.length === 1) return { username: parts[0], kind: "profile" };
  return null;
}

// --- run -------------------------------------------------------------------
async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node scripts/diagnose-github.mjs <github-url>");
    process.exit(1);
  }

  console.log(`\nDiagnosing GitHub extraction for: ${url}\n${"=".repeat(60)}`);

  // 1. Auth
  console.log("\n[1] Auth");
  const auth = await resolveAuth();
  AUTH_HEADER = auth.header;
  if (auth.mode === "unauthenticated") {
    console.log(`${FAIL} mode: UNAUTHENTICATED — GitHub caps you at 60 requests/hour.`);
    console.log(`     This alone makes extraction a dice roll. Set GITHUB_APP_* or GITHUB_TOKEN.`);
  } else if (auth.header) {
    console.log(`${PASS} mode: ${auth.mode}${auth.expiresAt ? ` (token expires ${auth.expiresAt})` : ""}`);
  } else {
    console.log(`${FAIL} mode: ${auth.mode} but token resolution FAILED: ${auth.error}`);
    console.log(`     Falling back to unauthenticated (60/hr). Fix the GitHub App env.`);
  }

  // 2. Rate limit
  console.log("\n[2] Rate limit (/rate_limit)");
  const rl = await ghGet("/rate_limit");
  if (rl.ok && rl.json?.resources?.core) {
    const c = rl.json.resources.core;
    const resetIn = Math.max(0, Math.round((c.reset * 1000 - Date.now()) / 1000));
    const marker = c.remaining === 0 ? FAIL : c.remaining < 20 ? INFO : PASS;
    console.log(`${marker} core: ${c.remaining}/${c.limit} remaining (resets in ${resetIn}s)`);
    if (c.limit <= 60) console.log(`     limit is ${c.limit} → you are effectively UNAUTHENTICATED.`);
    if (c.remaining === 0) console.log(`     EXHAUSTED — every call returns 403 until reset. This is the dice roll.`);
  } else {
    console.log(`${FAIL} could not read rate limit (status ${rl.status}${rl.networkError ? `, ${rl.networkError}` : ""})`);
  }

  // 3. Parse URL
  console.log("\n[3] URL parse");
  const parsed = parseRepo(url);
  if (!parsed) {
    console.log(`${FAIL} unparseable as a github.com repo or profile URL → getRepoDNA returns null immediately.`);
    finish();
    return;
  }
  let owner, repo;
  if (parsed.kind === "profile") {
    console.log(`${INFO} parsed as PROFILE url (username: ${parsed.username}). Resolving best repo by stars…`);
    const list = await ghGet(`/users/${encodeURIComponent(parsed.username)}/repos?per_page=20&sort=updated`);
    if (!list.ok || !Array.isArray(list.json) || list.json.length === 0) {
      console.log(`${FAIL} no public repos / list failed (status ${list.status}) → getRepoDNA returns null.`);
      finish();
      return;
    }
    const top = [...list.json].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))[0];
    owner = top.owner?.login ?? parsed.username;
    repo = top.name;
    console.log(`${PASS} chose ${owner}/${repo}`);
  } else {
    owner = parsed.owner;
    repo = parsed.repo;
    console.log(`${PASS} ${parsed.kind}: owner="${owner}" repo="${repo}"`);
  }

  // 4. Repo metadata
  console.log("\n[4] Repo metadata (/repos/owner/repo)");
  const meta = await ghGet(`/repos/${owner}/${repo}`);
  if (!meta.ok) {
    if (meta.status === 404) {
      console.log(`${FAIL} 404 — repo not found, renamed, private, or owner/repo parsed wrong → getRepoDNA returns null ("Repo inaccessible").`);
    } else if (meta.status === 403) {
      console.log(`${FAIL} 403 — forbidden or rate-limited → getRepoDNA returns null. See [2] above.`);
    } else {
      console.log(`${FAIL} status ${meta.status}${meta.networkError ? ` (${meta.networkError})` : ""} → getRepoDNA returns null.`);
    }
    finish();
    return;
  }
  const defaultBranch = meta.json?.default_branch || "main";
  console.log(`${PASS} ok — default_branch="${defaultBranch}", private=${meta.json?.private}, size=${meta.json?.size}KB`);

  // 5. Git tree
  console.log("\n[5] Git tree (recursive)");
  const tree = await ghGet(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
  if (!tree.ok || !Array.isArray(tree.json?.tree)) {
    console.log(`${FAIL} tree fetch failed (status ${tree.status}). getRepoDNA falls back to the latest-commit SHA tree; if that also fails it returns null.`);
    finish();
    return;
  }
  const entries = tree.json.tree;
  const truncated = tree.json.truncated === true;
  const backend = entries.filter(
    (e) => e.type === "blob" && BACKEND_EXTENSIONS.some((ext) => String(e.path).toLowerCase().endsWith(ext)) && (e.size ?? 0) <= 400 * 1024
  );
  console.log(`${truncated ? INFO : PASS} ${entries.length} tree entries${truncated ? " (TRUNCATED — large repo; tail dropped)" : ""}`);
  const marker = backend.length === 0 ? FAIL : PASS;
  console.log(`${marker} ${backend.length} backend code files (${BACKEND_EXTENSIONS.join(" ")})`);
  if (backend.length === 0) {
    console.log(`     No matching files → ESQ scores low/zero, but NOT "Repo inaccessible". This is a real signal, not a bug.`);
  } else {
    console.log(`     e.g. ${backend.slice(0, 5).map((f) => f.path).join(", ")}`);
  }

  // 6. Verdict
  console.log(`\n${"=".repeat(60)}\nVerdict:`);
  if (truncated && backend.length === 0) {
    console.log("  Tree was truncated AND no backend files surfaced — likely a huge repo. Consider a contents-API fallback.");
  } else if (backend.length === 0) {
    console.log("  Extraction reaches the tree but finds no backend code → legitimately low ESQ, not an access failure.");
  } else {
    console.log("  Extraction should SUCCEED for this repo+auth. If production still fails on it, the difference is");
    console.log("  almost certainly auth/env in the worker, or rate budget exhausted at eval time (re-check [1]/[2]).");
  }
  finish();
}

function finish() {
  console.log("");
}

main().catch((e) => {
  console.error("diagnose-github crashed:", e);
  process.exit(1);
});
