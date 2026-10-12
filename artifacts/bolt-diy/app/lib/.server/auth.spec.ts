import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { getFirebaseIdToken, isApiPath, requireApiAuthentication, withApiAuthentication } from './auth';

const projectId = 'bolt-auth-tests';
const issuer = `https://securetoken.google.com/${projectId}`;
const sessionIssuer = `https://session.firebase.google.com/${projectId}`;

describe('Firebase API authentication', () => {
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let keySet: ReturnType<typeof createLocalJWKSet>;

  beforeEach(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;

    const publicJwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'bolt-auth-test-key',
      alg: 'RS256',
      use: 'sig' as const,
    };
    keySet = createLocalJWKSet({ keys: [publicJwk] });
  });

  async function createToken(tokenIssuer = issuer) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'bolt-auth-test-key' })
      .setIssuer(tokenIssuer)
      .setAudience(projectId)
      .setSubject('test-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  it('recognizes only API paths', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/chat')).toBe(true);
    expect(isApiPath('/apiary')).toBe(false);
    expect(isApiPath('/')).toBe(false);
  });

  it('rejects a request without a token with the exact 401 response', async () => {
    const rejection = await requireApiAuthentication(new Request('https://app.test/api/chat'), {
      FIREBASE_PROJECT_ID: projectId,
    });

    expect(rejection?.status).toBe(401);
    expect(await rejection?.json()).toEqual({ error: 'Authentication required' });
  });

  it('accepts a valid Firebase ID token from the Bearer header', async () => {
    const token = await createToken();
    const response = await requireApiAuthentication(
      new Request('https://app.test/api/chat', { headers: { Authorization: `Bearer ${token}` } }),
      { FIREBASE_PROJECT_ID: projectId },
      keySet,
      keySet,
    );

    expect(response).toBeNull();
  });

  it('accepts a valid Firebase session cookie', async () => {
    const token = await createToken(sessionIssuer);
    const response = await requireApiAuthentication(
      new Request('https://app.test/api/chat', { headers: { Cookie: `__session=${token}` } }),
      { FIREBASE_PROJECT_ID: projectId },
      keySet,
      keySet,
    );

    expect(
      getFirebaseIdToken(new Request('https://app.test/api/chat', { headers: { Cookie: `__session=${token}` } })),
    ).toBe(token);
    expect(response).toBeNull();
  });

  it('blocks unauthenticated API routes before invoking the route handler', async () => {
    let routeInvoked = false;
    const response = await withApiAuthentication(
      new Request('https://app.test/api/models'),
      { FIREBASE_PROJECT_ID: projectId },
      async () => {
        routeInvoked = true;
        return new Response('ok');
      },
      keySet,
      keySet,
    );

    expect(response.status).toBe(401);
    expect(routeInvoked).toBe(false);
  });

  it('does not apply the API guard to page routes', async () => {
    const response = await withApiAuthentication(
      new Request('https://app.test/'),
      {},
      async () => new Response('page'),
      keySet,
      keySet,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('page');
  });

  it('rejects malformed or incorrectly signed tokens', async () => {
    const response = await requireApiAuthentication(
      new Request('https://app.test/api/chat', { headers: { Authorization: 'Bearer not-a-jwt' } }),
      { FIREBASE_PROJECT_ID: projectId },
      keySet,
      keySet,
    );

    expect(response?.status).toBe(401);
  });
});
