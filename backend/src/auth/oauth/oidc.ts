import { HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { AppException } from '../../common/filters/app.exception';
import type { ProviderProfile } from './oauth-providers';

export interface OidcProviderDef {
  provider: 'google' | 'microsoft';
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  scope: string;
  extraAuthorizeParams?: Record<string, string>;
  /** Issuer check — Microsoft's multi-tenant issuer depends on the token's own `tid`. */
  issuerValid: (payload: JWTPayload) => boolean;
  toProfile: (payload: JWTPayload) => Omit<ProviderProfile, 'provider'>;
}

export function googleDef(): OidcProviderDef {
  return {
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email profile',
    extraAuthorizeParams: { prompt: 'select_account' },
    issuerValid: (p) =>
      p.iss === 'https://accounts.google.com' ||
      p.iss === 'accounts.google.com',
    toProfile: (p) => ({
      subject: String(p.sub),
      email:
        typeof p.email === 'string'
          ? p.email.normalize('NFKC').trim().toLowerCase()
          : undefined,
      emailVerified: p.email_verified === true,
      name: typeof p.name === 'string' ? p.name : undefined,
    }),
  };
}

/** Microsoft's fixed tenant id for personal (consumer) Microsoft accounts. */
export const MICROSOFT_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

/**
 * `common` = personal Microsoft accounts + work/school accounts (auth spec §4.2). `allowedTenants`
 * (MICROSOFT_ALLOWED_TENANTS) restricts which `tid`s may sign in at all; empty = any.
 */
export function microsoftDef(
  tenant = 'common',
  allowedTenants: string[] = [],
): OidcProviderDef {
  const allow = allowedTenants
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`;
  const multiTenant = ['common', 'organizations', 'consumers'].includes(tenant);
  return {
    provider: 'microsoft',
    authorizeUrl: `${base}/oauth2/v2.0/authorize`,
    tokenUrl: `${base}/oauth2/v2.0/token`,
    jwksUrl: `${base}/discovery/v2.0/keys`,
    scope: 'openid profile email',
    extraAuthorizeParams: { prompt: 'select_account' },
    issuerValid: (p) => {
      const tid = typeof p.tid === 'string' ? p.tid : '';
      if (!/^[0-9a-f-]{36}$/i.test(tid)) return false;
      if (!multiTenant && tid.toLowerCase() !== tenant.toLowerCase()) {
        return false;
      }
      if (allow.length && !allow.includes(tid.toLowerCase())) return false;
      return p.iss === `https://login.microsoftonline.com/${tid}/v2.0`;
    },
    toProfile: (p) => {
      const tid = typeof p.tid === 'string' ? p.tid.toLowerCase() : undefined;
      // Never `preferred_username` (a UPN, admin-changeable). The `email` claim counts as verified
      // only for a personal Microsoft account (spec §4.2 rule 5); work/school email is unverified.
      const email =
        typeof p.email === 'string' && p.email.includes('@')
          ? p.email.normalize('NFKC').trim().toLowerCase()
          : undefined;
      return {
        subject: String(p.sub),
        email,
        emailVerified: !!email && tid === MICROSOFT_CONSUMER_TENANT,
        name: typeof p.name === 'string' ? p.name : undefined,
        tenantId: tid,
      };
    },
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(
  def: OidcProviderDef,
  p: {
    clientId: string;
    redirectUri: string;
    state: string;
    nonce: string;
    codeVerifier: string;
  },
): string {
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: def.scope,
    state: p.state,
    nonce: p.nonce,
    code_challenge: pkceChallenge(p.codeVerifier),
    code_challenge_method: 'S256',
    ...(def.extraAuthorizeParams ?? {}),
  });
  return `${def.authorizeUrl}?${params.toString()}`;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();
/** Remote JWKS with jose's built-in caching and key-rotation refetch. */
export function remoteJwks(url: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

/**
 * Verifies an ID token: signature against the provider JWKS, audience, expiry/iat (with 60s skew),
 * issuer and nonce. Throws a typed error on any failure — never returns an unverified profile.
 */
export async function verifyIdToken(
  def: OidcProviderDef,
  idToken: string,
  opts: { clientId: string; nonce: string; jwks: JWTVerifyGetKey },
): Promise<ProviderProfile> {
  const invalid = (why: string) =>
    new AppException(
      'PROVIDER_TOKEN_INVALID',
      `Sign-in token rejected (${why})`,
      HttpStatus.UNAUTHORIZED,
    );
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, opts.jwks, {
      audience: opts.clientId,
      algorithms: ['RS256'],
      clockTolerance: 60,
      requiredClaims: ['sub', 'iat', 'exp', 'iss', 'aud'],
    }));
  } catch (err) {
    throw invalid(err instanceof Error ? err.message : 'signature');
  }
  if (!def.issuerValid(payload)) throw invalid('issuer');
  if (payload.nonce !== opts.nonce) throw invalid('nonce');
  if (typeof payload.iat === 'number' && payload.iat > Date.now() / 1000 + 60) {
    throw invalid('issued in the future');
  }
  return { provider: def.provider, ...def.toProfile(payload) };
}

/** Authorization-code exchange (PKCE verifier + client secret). Returns the raw ID token. */
export async function exchangeCodeForIdToken(
  def: OidcProviderDef,
  p: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier: string;
  },
): Promise<string> {
  const res = await axios.post<{ id_token?: string }>(
    def.tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
      code_verifier: p.codeVerifier,
    }).toString(),
    {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    },
  );
  if (!res.data.id_token) {
    throw new AppException(
      'PROVIDER_TOKEN_INVALID',
      'The provider returned no ID token',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return res.data.id_token;
}
