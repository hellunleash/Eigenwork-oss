/**
 * Mint a real Firebase ID token for a QA run, without a browser.
 *
 * WHY: the QA probes need bearer tokens for one or two distinct users, and
 * hand-copying them out of devtools is both awkward (the modular SDK exposes no
 * `firebase` global) and short-lived (ID tokens expire in an hour, which is
 * shorter than a debugging session). Admin can mint a custom token for any uid;
 * the Identity Toolkit REST endpoint exchanges that for a genuine ID token that
 * `verifyIdToken` accepts — the same code path a browser sign-in produces.
 *
 * Server-side QA only. This is deliberately NOT importable from anything under
 * app/ — it can mint credentials for arbitrary users, so it lives in scripts/
 * and reads the admin key from .env.local like every other diagnostic here.
 */

import { loadEnvConfig } from "@next/env";
import { getAdminAuth } from "@/lib/firebase-admin";

// Same env convention as the diagnose-*/qa-* scripts: .env.local via @next/env.
loadEnvConfig(process.cwd());

/** Resolve a uid from an explicit uid or an email address. */
export async function resolveUid(idOrEmail: string): Promise<string> {
  if (!idOrEmail.includes("@")) return idOrEmail;
  const user = await getAdminAuth().getUserByEmail(idOrEmail);
  return user.uid;
}

/**
 * A signed ID token for `idOrEmail`, valid for one hour.
 * Throws with a readable message rather than returning a broken token — a QA
 * probe that runs with a bad credential produces misleading passes.
 */
export async function mintIdToken(idOrEmail: string): Promise<string> {
  // Read lazily, not at module load: importers may pull dotenv in after this
  // module is evaluated, and a key captured too early reads as absent.
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required to exchange a custom token");
  }

  const uid = await resolveUid(idOrEmail);
  const customToken = await getAdminAuth().createCustomToken(uid);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  if (!res.ok) {
    throw new Error(`custom-token exchange failed (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("custom-token exchange returned no idToken");
  return data.idToken;
}

/** `npx tsx scripts/qa-id-token.ts <uid|email>` — prints a token for manual curl. */
if (process.argv[1]?.includes("qa-id-token")) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: npx tsx scripts/qa-id-token.ts <uid|email>");
    process.exit(1);
  }
  mintIdToken(target)
    .then((t) => console.log(t))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
