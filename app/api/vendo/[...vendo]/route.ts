import { openai } from "@ai-sdk/openai";
import { createVendo, guard, nextVendoHandler } from "@vendoai/vendo/server";
import type { CatalogFile, ExtractedTool, OverridesFile, PolicyFile } from "@vendoai/vendo";
import { requireFirebaseUser } from "@/lib/auth-server";

// The .vendo/ contract is IMPORTED, not read off disk.
//
// Vendo reads its catalog at runtime with a path it builds from cwd
// (`readFileSync(`${vendoDirOf(root ?? ".")}/tools.json`)`). Nothing in a
// Turbopack build can see that, so the files never enter the serverless
// function and every read returns undefined in production. The failure is
// silent and expensive: the wire still answers 200 and the agent still talks,
// it just has no tools — one "[vendo] zero live host tools" warning per boot,
// then every request for real data fails. Locally it all works, because the
// files are sitting right there on disk.
//
// `outputFileTracingIncludes` does not rescue it — that option is webpack-only
// and Next 16 builds with Turbopack, so it is silently ignored.
//
// Importing makes them modules, so the bundler carries them wherever this route
// goes. Per Vendo's own docs the `profile` object "feeds the guard inline,
// replacing the file leg entirely".
//
// overrides.json matters most here: absent, it fails OPEN — every tool the
// judge fenced to internal/operator (worker/evaluate, dev/grant, the Paddle
// webhook, the Slack transport routes) goes live instead.
import toolsFile from "../../../../.vendo/tools.json";
import overridesFile from "../../../../.vendo/overrides.json";
import policyFile from "../../../../.vendo/policy.json";
import catalogFile from "../../../../.vendo/catalog.json";

const vendo = createVendo({
  // Who the wire's callers act as. Firebase Auth is not one of Vendo's presets,
  // so the seam is wired by hand onto the same verifier every other API route
  // uses (`requireFirebaseUser` -> verifyIdToken checkRevoked). The subject is
  // the Firebase uid, so apps and approvals created in chat are visible to the
  // embeds, which call this route directly. No session -> null (anonymous).
  principal: async (request: Request) => {
    const auth = await requireFirebaseUser(request.headers);
    if (auth.ok) return { kind: "user" as const, subject: auth.userId };
    // No Firebase session on the request. Outside development the wire stays
    // shut (null -> 403): minting one shared anonymous subject would put every
    // logged-out visitor on the SAME Vendo session, reading each other's
    // threads. In dev we hand back a local-only subject so the surface and
    // `vendo doctor` can probe the wire without a signed-in browser.
    if (process.env.NODE_ENV === "production") return null;
    return { kind: "user" as const, subject: "dev-local", ephemeral: true };
  },
  models: { default: openai("gpt-5") }, // OPENAI_API_KEY supplies the key
  guard: guard({ policy: {} }), // .vendo/policy.json: destructive asks, reads run
  profile: {
    tools: toolsFile.tools as unknown as ExtractedTool[],
    overrides: overridesFile as unknown as OverridesFile,
    policy: policyFile as unknown as PolicyFile,
    catalog: catalogFile as unknown as CatalogFile,
  },
});

export const { GET, POST, PUT, PATCH, DELETE } = nextVendoHandler(vendo);
