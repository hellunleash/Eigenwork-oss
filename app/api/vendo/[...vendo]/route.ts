import { openai } from "@ai-sdk/openai";
import { createVendo, guard, nextVendoHandler } from "@vendoai/vendo/server";
import { requireFirebaseUser } from "@/lib/auth-server";

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
});

export const { GET, POST, PUT, PATCH, DELETE } = nextVendoHandler(vendo);
