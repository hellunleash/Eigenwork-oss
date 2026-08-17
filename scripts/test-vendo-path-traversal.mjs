#!/usr/bin/env node
/**
 * Does THIS install let a route tool climb above its declared route?
 *
 * Upstream runvendo/vendo#1439 (open as of 2026-08-17) reports that route-tool
 * call arguments are substituted into a binding's path by `withPathArgs`
 * (@vendoai/actions/dist/runtime/registry.js) using `encodeURIComponent`, which
 * escapes `/` but leaves `.` and `..` alone — and the array branch joins
 * segments with a RAW `/`. A tool arg of ".." therefore walks up a directory,
 * and `new URL()` normalizes the climb away before the request is sent.
 *
 * It is reachable because a tool's `inputSchema` is only DESCRIBED to the model,
 * never enforced at execution, and the value originates in model output driven
 * by end-user chat text. This product feeds candidate-supplied resume text into
 * the agent, so that is a live injection surface.
 *
 * This script does not reimplement the logic — it reads the shipped
 * `withPathArgs` source out of node_modules and runs those exact bytes, so the
 * verdict describes the installed version rather than a copy of it.
 *
 * Run: node scripts/test-vendo-path-traversal.mjs
 * Exit 0 = not vulnerable. Exit 1 = vulnerable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRY = join(root, "node_modules/@vendoai/actions/dist/runtime/registry.js");
const BASE_URL = process.env.VENDO_BASE_URL || "https://www.eigenwork.com";

class VendoError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** Lift the shipped function out of the installed bundle and run it as-is. */
function loadShippedWithPathArgs() {
  const source = readFileSync(REGISTRY, "utf8");
  const start = source.indexOf("function withPathArgs(");
  if (start === -1) {
    throw new Error("withPathArgs not found — the package layout changed; re-check this script against the installed version.");
  }
  // Walk braces from the function's opening brace to its matching close.
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  const fnSource = source.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function("VendoError", `${fnSource}; return withPathArgs;`)(VendoError);
}

const withPathArgs = loadShippedWithPathArgs();

/** Real bindings from this install's .vendo/tools.json. */
const CASES = [
  {
    name: "control — a normal candidate id",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: "abc123" },
    expectEscape: false,
  },
  {
    name: "scalar dot-dot",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ".." },
    expectEscape: true,
  },
  {
    name: "array climb to the admin grant backdoor",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ["..", "..", "dev", "grant"] },
    expectEscape: true,
  },
  {
    name: "array climb off the API surface entirely",
    tool: "host_candidate_stage_update",
    path: "/api/candidate/{id}/stage",
    args: { id: ["..", "..", "..", "admin"] },
    expectEscape: true,
  },
  {
    name: "encoded slash stays contained (should NOT escape)",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: "a/b" },
    expectEscape: false,
  },
  // The cases above climb PAST /api and land on routes this app does not serve,
  // which makes the escape look harmless. These are the ones that matter: a
  // single `..` stays inside /api and lands on a REAL sibling route — one that
  // is not in the tool catalog, reached with the caller's forwarded Bearer.
  {
    name: "SIBLING: the worker eval endpoint (worker/cron secret only)",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ["..", "worker", "evaluate"] },
    expectEscape: true,
  },
  {
    name: "SIBLING: the admin grant backdoor, inside /api this time",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ["..", "dev", "grant"] },
    expectEscape: true,
  },
  {
    name: "SIBLING: org member role management",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ["..", "org", "members", "manage"] },
    expectEscape: true,
  },
  {
    name: "SIBLING: the Paddle webhook (HMAC-verified)",
    tool: "host_candidate_get",
    path: "/api/candidate/{id}",
    args: { id: ["..", "paddle", "webhook"] },
    expectEscape: true,
  },
];

let vulnerable = 0;
console.log(`base URL: ${BASE_URL}`);
console.log(`registry: ${REGISTRY.replace(root, ".")}\n`);

for (const testCase of CASES) {
  let resolvedPath;
  let rejected = null;
  try {
    resolvedPath = withPathArgs(testCase.path, testCase.args).path;
  } catch (error) {
    rejected = error instanceof Error ? error.message : String(error);
  }

  if (rejected !== null) {
    console.log(`[rejected] ${testCase.name}`);
    console.log(`           ${testCase.path}  args=${JSON.stringify(testCase.args)}`);
    console.log(`           refused before any request: ${rejected}\n`);
    continue;
  }

  // What the HTTP layer actually requests, after URL normalization.
  const finalUrl = new URL(resolvedPath, BASE_URL);
  const declaredPrefix = testCase.path.slice(0, testCase.path.indexOf("{"));
  const escaped = !finalUrl.pathname.startsWith(declaredPrefix);

  const verdict = escaped ? "ESCAPED" : "contained";
  console.log(`[${verdict}] ${testCase.name}`);
  console.log(`           declared: ${testCase.path}  args=${JSON.stringify(testCase.args)}`);
  console.log(`           substituted: ${resolvedPath}`);
  console.log(`           request goes to: ${finalUrl.pathname}\n`);

  if (escaped) vulnerable += 1;
  if (escaped !== testCase.expectEscape && !escaped) {
    console.log("           (note: expected an escape here and did not get one)\n");
  }
}

if (vulnerable > 0) {
  console.log(`VULNERABLE — ${vulnerable} case(s) left the declared route.`);
  console.log("Requests carry the signed-in caller's forwarded Authorization header, so they");
  console.log("arrive at the unintended route authenticated as that user. Per-route authz");
  console.log("(requireOrgMember + 404-on-non-owner) is what bounds the damage, not Vendo.");
  console.log("Fixed upstream by runvendo/vendo#1439; re-run this after upgrading.");
  process.exit(1);
}

console.log("NOT VULNERABLE — every dot-segment was refused or contained.");
process.exit(0);
