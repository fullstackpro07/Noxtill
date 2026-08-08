import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generic HMAC-signed payload token — used for the OAuth `state` param (BE-082, proves the
 * callback's businessId wasn't forged) and the email-campaign unsubscribe link (BE-083, no DB
 * round-trip needed to validate). Format: `${base64url(json)}.${base64url(hmac)}`.
 */
export function signPayload<T extends object>(payload: T, secret: string): string {
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(json).digest('base64url');
  return `${json}.${signature}`;
}

export function verifyPayload<T extends object>(token: string, secret: string): T | null {
  const [json, signature] = token.split('.');
  if (!json || !signature) return null;

  const expected = createHmac('sha256', secret).update(json).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
