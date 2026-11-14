import type { CookieOptions, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Session cookies (auth security spec §8.2). On HTTPS the names carry the `__Host-` prefix, which
 * makes the browser enforce Secure, Path=/ and no Domain. On plain-http local development the
 * prefix/Secure can't be used, so the same cookies are set without them. Both are HttpOnly and
 * SameSite=Lax (Strict would break the return leg of OAuth redirects).
 */
export function cookiesSecure(): boolean {
  const flag = process.env.AUTH_COOKIE_SECURE;
  if (flag) return flag.toLowerCase() === 'true';
  return (process.env.BACKEND_URL ?? '').startsWith('https://');
}

const prefix = () => (cookiesSecure() ? '__Host-' : '');
export const cookieName = {
  access: () => `${prefix()}nx_at`,
  refresh: () => `${prefix()}nx_rt`,
  device: () => `${prefix()}nx_dev`,
};

function base(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: cookiesSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setSessionCookies(
  res: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessMaxAgeMs: number;
    refreshMaxAgeMs: number;
  },
) {
  res.cookie(
    cookieName.access(),
    tokens.accessToken,
    base(tokens.accessMaxAgeMs),
  );
  res.cookie(
    cookieName.refresh(),
    tokens.refreshToken,
    base(tokens.refreshMaxAgeMs),
  );
}

export function clearSessionCookies(res: Response) {
  const opts = {
    httpOnly: true,
    secure: cookiesSecure(),
    sameSite: 'lax' as const,
    path: '/',
  };
  res.clearCookie(cookieName.access(), opts);
  res.clearCookie(cookieName.refresh(), opts);
}

export function setDeviceCookie(res: Response, deviceId: string) {
  res.cookie(cookieName.device(), deviceId, base(400 * 24 * 3600 * 1000));
}

export function readCookie(req: Request, name: string): string | undefined {
  const jar = (req as unknown as { cookies?: Record<string, unknown> }).cookies;
  const value = jar?.[name];
  return typeof value === 'string' && value ? value : undefined;
}

function csrfSecret(): string {
  return `${process.env.AUTH_CSRF_SECRET || process.env.JWT_SECRET || 'noxtill-dev'}:csrf`;
}

/**
 * Synchronizer CSRF token bound to the session. The frontend receives it in JSON (never from a
 * cookie, so it also works when the API is on a different subdomain) and echoes it in
 * `X-CSRF-Token` on every state-changing request authenticated by cookie.
 */
export function csrfTokenFor(sessionId: string): string {
  return createHmac('sha256', csrfSecret())
    .update(sessionId)
    .digest('base64url');
}

export function csrfValid(
  sessionId: string,
  presented: string | undefined,
): boolean {
  if (!presented) return false;
  const a = Buffer.from(csrfTokenFor(sessionId));
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}
