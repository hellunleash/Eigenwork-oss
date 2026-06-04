import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

function waitForUser(timeoutMs = 2500): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsub = onAuthStateChanged(auth, (user) => {
      clearTimeout(t);
      unsub();
      resolve(user);
    });
    const t = setTimeout(() => {
      unsub();
      resolve(null);
    }, timeoutMs);
  });
}

export async function getIdTokenOrNull(): Promise<string | null> {
  const user = auth.currentUser ?? (await waitForUser());
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

