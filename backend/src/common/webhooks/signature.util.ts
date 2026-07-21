import { createHmac, timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Meta webhooks sign the raw request body: `X-Hub-Signature-256: sha256=<hmac>`. */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqual(signatureHeader.slice('sha256='.length), expected);
}

/**
 * Twilio signs `fullUrl + sorted(concatenated "key"+"value" pairs)` with
 * HMAC-SHA1 and the account auth token, base64-encoded, in `X-Twilio-Signature`.
 */
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
  authToken: string,
): boolean {
  if (!signatureHeader) return false;
  const data =
    fullUrl +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  const expected = createHmac('sha1', authToken)
    .update(data, 'utf8')
    .digest('base64');
  return safeEqual(signatureHeader, expected);
}
