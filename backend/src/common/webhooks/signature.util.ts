import { createHmac, createPublicKey, timingSafeEqual, verify } from 'crypto';

/** Constant-time string comparison — exported so callers with their own shared-secret check (not an HMAC signature) can avoid a timing side-channel too. */
export function safeEqual(a: string, b: string): boolean {
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

// Ed25519 SubjectPublicKeyInfo header for a raw 32-byte key — Node has no "raw" import format for
// createPublicKey, so this fixed ASN.1 prefix is prepended to get a DER blob it will accept.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Telnyx signs `<timestamp>|<raw body>` with Ed25519 and publishes its public key in the portal
 * (base64, 32 raw bytes) — this is signature verification against Telnyx's key, not an HMAC shared
 * secret. Headers: `telnyx-timestamp` and `telnyx-signature-ed25519` (base64). A tolerance window
 * guards against replay of an old captured payload.
 */
export function verifyTelnyxSignature(
  rawBody: Buffer,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  publicKeyBase64: string,
  toleranceSeconds = 300,
): boolean {
  if (!timestampHeader || !signatureHeader) return false;

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) {
    return false;
  }

  try {
    const der = Buffer.concat([
      ED25519_SPKI_PREFIX,
      Buffer.from(publicKeyBase64, 'base64'),
    ]);
    const publicKey = createPublicKey({
      key: der,
      format: 'der',
      type: 'spki',
    });
    const signedPayload = Buffer.concat([
      Buffer.from(`${timestampHeader}|`, 'utf8'),
      rawBody,
    ]);
    return verify(
      null,
      signedPayload,
      publicKey,
      Buffer.from(signatureHeader, 'base64'),
    );
  } catch {
    return false;
  }
}
