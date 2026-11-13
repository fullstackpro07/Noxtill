import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';
import { AppException } from '../../common/filters/app.exception';
import {
  buildAuthorizeUrl,
  googleDef,
  microsoftDef,
  pkceChallenge,
  verifyIdToken,
} from './oidc';

const CLIENT = 'client-123';
const NONCE = 'nonce-abc';
const TID = '9188040d-6c67-4c5b-b112-36a304b66dad';

async function keyset(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256' };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

async function sign(
  privateKey: KeyLike,
  kid: string,
  claims: Record<string, unknown>,
  opts: { exp?: string | number } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e) =>
      e instanceof AppException
        ? `${(e.getResponse() as { code: string }).code}:${(e.getResponse() as { message: string }).message}`
        : 'other',
  );

describe('OIDC ID-token validation (auth spec §8.1)', () => {
  let privateKey: KeyLike;
  let jwks: JWTVerifyGetKey;
  const google = googleDef();
  const ms = microsoftDef('common');
  const good = {
    iss: 'https://accounts.google.com',
    aud: CLIENT,
    sub: 'g-sub-1',
    nonce: NONCE,
    email: 'Owner@Example.com',
    email_verified: true,
    name: 'Owner One',
  };

  beforeAll(async () => {
    ({ privateKey, jwks } = await keyset('k1'));
  });

  it('accepts a valid Google token and keys the identity by sub, not email', async () => {
    const token = await sign(privateKey, 'k1', good);
    const profile = await verifyIdToken(google, token, {
      clientId: CLIENT,
      nonce: NONCE,
      jwks,
    });
    expect(profile).toEqual({
      provider: 'google',
      subject: 'g-sub-1',
      email: 'owner@example.com',
      emailVerified: true,
      name: 'Owner One',
    });
  });

  it('treats an unverified Google email as unverified', async () => {
    const token = await sign(privateKey, 'k1', {
      ...good,
      email_verified: false,
    });
    const profile = await verifyIdToken(google, token, {
      clientId: CLIENT,
      nonce: NONCE,
      jwks,
    });
    expect(profile.emailVerified).toBe(false);
  });

  it.each([
    ['wrong issuer', { iss: 'https://evil.example.com' }, 'issuer'],
    ['wrong audience', { aud: 'someone-else' }, 'aud'],
    ['wrong nonce', { nonce: 'replayed' }, 'nonce'],
  ])('rejects a %s', async (_label, override, why) => {
    const token = await sign(privateKey, 'k1', { ...good, ...override });
    const res = await codeOf(
      verifyIdToken(google, token, { clientId: CLIENT, nonce: NONCE, jwks }),
    );
    expect(res).toMatch(/^PROVIDER_TOKEN_INVALID:/);
    expect(res).toContain(why);
  });

  it('rejects an expired token', async () => {
    const token = await sign(privateKey, 'k1', good, {
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect(
      await codeOf(
        verifyIdToken(google, token, { clientId: CLIENT, nonce: NONCE, jwks }),
      ),
    ).toMatch(/^PROVIDER_TOKEN_INVALID:/);
  });

  it('rejects a token signed by a key that is not in the provider JWKS', async () => {
    const other = await keyset('k1');
    const token = await sign(other.privateKey, 'k1', good);
    expect(
      await codeOf(
        verifyIdToken(google, token, { clientId: CLIENT, nonce: NONCE, jwks }),
      ),
    ).toMatch(/^PROVIDER_TOKEN_INVALID:/);
  });

  it('Microsoft: issuer must match the token tenant, and email is never trusted as verified', async () => {
    const msClaims = {
      iss: `https://login.microsoftonline.com/${TID}/v2.0`,
      aud: CLIENT,
      sub: 'ms-sub-1',
      tid: TID,
      nonce: NONCE,
      email: 'person@outlook.com',
      name: 'Person',
    };
    const ok = await verifyIdToken(ms, await sign(privateKey, 'k1', msClaims), {
      clientId: CLIENT,
      nonce: NONCE,
      jwks,
    });
    expect(ok).toMatchObject({
      provider: 'microsoft',
      subject: 'ms-sub-1',
      email: 'person@outlook.com',
      emailVerified: false,
    });

    const spoofed = await sign(privateKey, 'k1', {
      ...msClaims,
      iss: 'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0',
    });
    expect(
      await codeOf(
        verifyIdToken(ms, spoofed, { clientId: CLIENT, nonce: NONCE, jwks }),
      ),
    ).toContain('issuer');
  });

  it('Microsoft single-tenant config rejects other tenants', async () => {
    const single = microsoftDef('11111111-1111-1111-1111-111111111111');
    const token = await sign(privateKey, 'k1', {
      iss: `https://login.microsoftonline.com/${TID}/v2.0`,
      aud: CLIENT,
      sub: 's',
      tid: TID,
      nonce: NONCE,
    });
    expect(
      await codeOf(
        verifyIdToken(single, token, { clientId: CLIENT, nonce: NONCE, jwks }),
      ),
    ).toContain('issuer');
  });

  it('authorize URL carries state, nonce and an S256 PKCE challenge — never the verifier', () => {
    const url = new URL(
      buildAuthorizeUrl(ms, {
        clientId: CLIENT,
        redirectUri: 'https://api.example.com/api/v1/auth/microsoft/callback',
        state: 'st',
        nonce: NONCE,
        codeVerifier: 'verifier-that-stays-server-side',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      pkceChallenge('verifier-that-stays-server-side'),
    );
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe(NONCE);
    expect(url.toString()).not.toContain('verifier-that-stays-server-side');
  });
});
