import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

const FIREBASE_PROJECT_ID_FALLBACK = 'v-cloud-storage';
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);
const FIREBASE_SESSION_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys'),
);

type AuthEnvironment = Record<string, string | undefined>;
type VerificationKey = Parameters<typeof jwtVerify>[1];

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function getCookieToken(request: Request): string | undefined {
  const cookies = request.headers.get('cookie');

  if (!cookies) {
    return undefined;
  }

  const acceptedNames = new Set(['__session', 'bolt_session', 'bolt_firebase_id_token']);

  for (const cookie of cookies.split(';')) {
    const separator = cookie.indexOf('=');

    if (separator < 0) {
      continue;
    }

    const name = cookie.slice(0, separator).trim();

    if (!acceptedNames.has(name)) {
      continue;
    }

    const value = cookie.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function getFirebaseIdToken(request: Request): string | undefined {
  const appToken = request.headers.get('x-bolt-firebase-auth')?.trim();

  if (appToken) {
    return appToken;
  }

  const authorization = request.headers.get('authorization');
  const bearerMatch = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (bearerMatch) {
    return bearerMatch[1];
  }

  return getCookieToken(request);
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string = FIREBASE_PROJECT_ID_FALLBACK,
  keySet: VerificationKey = FIREBASE_JWKS,
  sessionKeySet: VerificationKey = FIREBASE_SESSION_JWKS,
): Promise<void> {
  let payload: JWTPayload;

  try {
    ({ payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: 5,
    }));
  } catch (idTokenError) {
    try {
      ({ payload } = await jwtVerify(token, sessionKeySet, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://session.firebase.google.com/${projectId}`,
        clockTolerance: 5,
      }));
    } catch {
      throw idTokenError;
    }
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new Error('Firebase ID token has no valid subject');
  }
}

export async function requireApiAuthentication(
  request: Request,
  env: AuthEnvironment = {},
  keySet: VerificationKey = FIREBASE_JWKS,
  sessionKeySet: VerificationKey = FIREBASE_SESSION_JWKS,
): Promise<Response | null> {
  const token = getFirebaseIdToken(request);

  if (!token) {
    return authenticationRequiredResponse();
  }

  const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID_FALLBACK;

  try {
    await verifyFirebaseIdToken(token, projectId, keySet, sessionKeySet);
    return null;
  } catch {
    return authenticationRequiredResponse();
  }
}

export async function withApiAuthentication(
  request: Request,
  env: AuthEnvironment,
  next: () => Promise<Response>,
  keySet: VerificationKey = FIREBASE_JWKS,
  sessionKeySet: VerificationKey = FIREBASE_SESSION_JWKS,
): Promise<Response> {
  if (!isApiPath(new URL(request.url).pathname)) {
    return next();
  }

  const rejection = await requireApiAuthentication(request, env, keySet, sessionKeySet);

  return rejection ?? next();
}

function authenticationRequiredResponse(): Response {
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
