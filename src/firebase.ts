import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase web config comes from build-time env (VITE_FIREBASE_*), not from a committed file.
// These values are public by design (they ship in the browser bundle), but keeping them out of git
// lets each deployment pick its Firebase project. Access is enforced by Firestore/Storage rules
// and by the SocialSync server, which verifies the Firebase ID token on every /api call.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};
const firestoreDatabaseId: string | undefined = env.VITE_FIRESTORE_DATABASE_ID || undefined;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('SocialSync: VITE_FIREBASE_* variables are missing at build time. See SETUP.md.');
}

const app = initializeApp(firebaseConfig);
export const db = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
export const auth = getAuth(app);
export const storage = firebaseConfig.storageBucket ? getStorage(app, `gs://${firebaseConfig.storageBucket}`) : getStorage(app);

/** fetch() wrapper for the SocialSync API: attaches the signed-in user's Firebase ID token. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: { userId?: string; email?: string | null };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: auth.currentUser?.uid, email: auth.currentUser?.email },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Error signing in with Google', error);
  }
};

export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out', error);
  }
};
