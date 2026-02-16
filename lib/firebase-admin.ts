/**
 * Firebase Admin SDK — server-side only.
 * Use this in API routes and server context. Bypasses Firestore security rules.
 * Do NOT import in client components — use lib/firebase.ts for browser.
 */
import { getApps, initializeApp, getApp, cert, applicationDefault, App, ServiceAccount } from "firebase-admin/app";
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

const DEFAULT_EXPIRY_MS = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years

/** Upload buffer to Storage path; returns signed download URL. */
export async function adminStorageUpload(path: string, buffer: Buffer, contentType = "application/pdf"): Promise<string> {
  const bucket = getAdminStorage().bucket();
  const file = bucket.file(path);
  await file.save(buffer, { contentType, metadata: { contentType } });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + DEFAULT_EXPIRY_MS,
  });
  return url;
}

/** Delete file from Storage. */
export async function adminStorageDelete(path: string): Promise<void> {
  const bucket = getAdminStorage().bucket();
  await bucket.file(path).delete();
}
