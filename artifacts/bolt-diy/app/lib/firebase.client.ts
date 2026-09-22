import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  setPersistence,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';

const firebaseConfig = {
  /*
   * Firebase web configuration is public client configuration. Keep the
   * environment overrides for deployments, but include the project defaults
   * so a copied project does not lose its sign-in setup.
   */
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBsBGxWbL6DIgMlND3eUAVNRHsBH4VKquo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'v-cloud-storage.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://v-cloud-storage-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'v-cloud-storage',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'v-cloud-storage.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '367814757584',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:367814757584:web:83848f9cbbf07006a1a2d5',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-KXZ5S9V004',
};

export const firebaseAuthConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

export const FIREBASE_SESSION_STORAGE_KEY = 'bolt_firebase_session';
export const FIREBASE_ID_TOKEN_STORAGE_KEY = 'bolt_firebase_id_token';

export type CachedFirebaseUser = Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'>;

export let isAuthenticated = false;
export let currentUser: User | null = null;

let firebaseApp: FirebaseApp | undefined;
let firebaseAuth: Auth | undefined;
let firebasePersistencePromise: Promise<void> | undefined;

export function getFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined' || !firebaseAuthConfigured) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }

  firebaseAuth ??= getAuth(firebaseApp);

  return firebaseAuth;
}

export function observeFirebaseUser(listener: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();

  if (auth) {
    void ensureFirebaseAuthPersistence();
  }

  return auth ? onAuthStateChanged(auth, listener) : () => undefined;
}

export function ensureFirebaseAuthPersistence(): Promise<void> {
  const auth = getFirebaseAuthOrThrow();

  firebasePersistencePromise ??= setPersistence(auth, browserLocalPersistence).catch((error) => {
    logFirebaseAuthError('setPersistence', error);
  });

  return firebasePersistencePromise;
}

export function updateFirebaseAuthState(user: User | null): void {
  currentUser = user;
  isAuthenticated = Boolean(user);
}

export function getCachedFirebaseUser(): CachedFirebaseUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = JSON.parse(
      localStorage.getItem(FIREBASE_SESSION_STORAGE_KEY) || 'null',
    ) as Partial<CachedFirebaseUser> | null;

    if (!cached?.uid) {
      return null;
    }

    return {
      uid: cached.uid,
      email: cached.email ?? null,
      displayName: cached.displayName ?? null,
      photoURL: cached.photoURL ?? null,
    };
  } catch {
    return null;
  }
}

export function cacheFirebaseUser(user: User): CachedFirebaseUser {
  const cachedUser: CachedFirebaseUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FIREBASE_SESSION_STORAGE_KEY, JSON.stringify(cachedUser));
    } catch {
      // Auth state remains usable when browser storage is unavailable.
    }
  }

  return cachedUser;
}

export async function persistFirebaseUserSession(user: User): Promise<CachedFirebaseUser> {
  const cachedUser = cacheFirebaseUser(user);

  if (typeof window !== 'undefined') {
    try {
      const idToken = await user.getIdToken();
      localStorage.setItem(FIREBASE_ID_TOKEN_STORAGE_KEY, idToken);
    } catch (error) {
      logFirebaseAuthError('persistSession', error);
    }
  }

  updateFirebaseAuthState(user);

  return cachedUser;
}

export function clearCachedFirebaseUser(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(FIREBASE_SESSION_STORAGE_KEY);
    localStorage.removeItem(FIREBASE_ID_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuthOrThrow();
  await ensureFirebaseAuthPersistence();

  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithGoogleRedirect(): Promise<void> {
  const auth = getFirebaseAuthOrThrow();
  await ensureFirebaseAuthPersistence();

  return signInWithRedirect(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getFirebaseAuthOrThrow();
  await ensureFirebaseAuthPersistence();

  return signInWithEmailAndPassword(auth, email, password);
}

export async function createAccountWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getFirebaseAuthOrThrow();
  await ensureFirebaseAuthPersistence();

  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithGithub(): Promise<UserCredential> {
  const auth = getFirebaseAuthOrThrow();
  const provider = new GithubAuthProvider();
  provider.addScope('repo');
  provider.addScope('read:org');
  provider.addScope('read:user');

  await ensureFirebaseAuthPersistence();

  return signInWithPopup(auth, provider);
}

export async function signInWithGithubRedirect(): Promise<void> {
  const auth = getFirebaseAuthOrThrow();
  const provider = new GithubAuthProvider();
  provider.addScope('repo');
  provider.addScope('read:org');
  provider.addScope('read:user');

  await ensureFirebaseAuthPersistence();

  return signInWithRedirect(auth, provider);
}

export async function getFirebaseRedirectResult(): Promise<UserCredential | null> {
  const auth = getFirebaseAuthOrThrow();
  await ensureFirebaseAuthPersistence();

  return getRedirectResult(auth);
}

export function getGithubAccessToken(result: UserCredential): string | null {
  return GithubAuthProvider.credentialFromResult(result)?.accessToken ?? null;
}

export function signOut(): Promise<void> {
  clearCachedFirebaseUser();
  updateFirebaseAuthState(null);

  return firebaseSignOut(getFirebaseAuthOrThrow());
}

export function getFirebaseAuthErrorCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String((error as { code?: string }).code || 'unknown') : 'unknown';
}

export function logFirebaseAuthError(context: string, error: unknown): void {
  console.error(`[Firebase Auth] ${context} failed (${getFirebaseAuthErrorCode(error)})`, error);
}

function getFirebaseAuthOrThrow(): Auth {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error('Firebase Authentication is not configured for this environment.');
  }

  return auth;
}
