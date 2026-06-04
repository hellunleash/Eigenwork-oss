/**
 * Firebase Admin SDK — server-side only.
 * Use this in API routes and server context. Bypasses Firestore security rules.
 * Do NOT import in client components — use lib/firebase.ts for browser.
 */
import { getApps, initializeApp, getApp, cert, applicationDefault, App, ServiceAccount } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApp() as App;
    return adminApp;
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  let credential;
  if (key) {
    try {
      const parsed = JSON.parse(key) as ServiceAccount;
      credential = cert(parsed);
    } catch (e) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON:", e);
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY must be valid JSON");
    }
  } else {
    credential = applicationDefault();
  }

  adminApp = initializeApp({
    credential,
    projectId: projectId || undefined,
    storageBucket: storageBucket || undefined,
  });
  return adminApp;
}

let _adminDb: Firestore | null = null;

/** Firestore instance — use in API routes. Bypasses security rules. */
export function getAdminDb(): Firestore {
  if (!_adminDb) {
    _adminDb = getFirestore(getAdminApp());
  }
  return _adminDb;
}

let _adminAuth: Auth | null = null;

/** Admin Auth instance — use to verify Firebase ID tokens server-side. */
export function getAdminAuth(): Auth {
  if (!_adminAuth) {
    _adminAuth = getAuth(getAdminApp());
  }
  return _adminAuth;
}

/** Get admin Firestore. Lazy-initialized; call getAdminDb() in API routes. */

let _adminStorage: Storage | null = null;

/** Storage instance — use in API routes for resume upload/delete. */
export function getAdminStorage(): Storage {
  if (!_adminStorage) {
    _adminStorage = getStorage(getAdminApp());
  }
  return _adminStorage;
}

/** FieldValue for serverTimestamp, increment, etc. */
export { FieldValue } from "firebase-admin/firestore";

// Resume PDF signed URLs are short-lived (1 hour). Anything that needs a URL
// must call freshResumeUrl(path) at read time. Never persist these URLs in
// Firestore documents — the path is what gets stored; the URL is generated
// fresh per authorized response.
//
// Historical context: this constant used to be 10 years, which made any
// leaked URL effectively permanent and made GDPR "right to deletion" requests
// impossible to honor. See bugs-fixed/storage.txt (2026-06-03).
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Upload buffer to Storage path; returns a short-lived signed URL (1h).
 *  Callers should store only the `path`, not this URL. */
export async function adminStorageUpload(path: string, buffer: Buffer, contentType = "application/pdf"): Promise<string> {
  const bucket = getAdminStorage().bucket();
  const file = bucket.file(path);
  await file.save(buffer, { contentType, metadata: { contentType } });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return url;
}

/** Generate a fresh 1-hour signed read URL for a stored Storage path.
 *  Returns null if path is empty/missing or generation fails. Safe to call
 *  during response building; never throws. */
export async function freshResumeUrl(path: string | null | undefined): Promise<string | null> {
  if (!path || typeof path !== "string") return null;
  try {
    const bucket = getAdminStorage().bucket();
    const file = bucket.file(path);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return url;
  } catch {
    return null;
  }
}

/** Download file bytes from Storage path. */
export async function adminStorageDownload(path: string): Promise<Buffer> {
  const bucket = getAdminStorage().bucket();
  const file = bucket.file(path);
  const [buf] = await file.download();
  return buf;
}

/** Delete file from Storage. */
export async function adminStorageDelete(path: string): Promise<void> {
  const bucket = getAdminStorage().bucket();
  await bucket.file(path).delete();
}
