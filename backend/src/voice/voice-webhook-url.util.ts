import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';

/** Twilio signs the public URL, even when a TLS proxy forwards HTTP to Nest. */
export function voiceWebhookRequestUrl(
  backendUrl: string | undefined,
  request: { protocol: string; host: string | undefined; originalUrl: string },
): string {
  if (!backendUrl) {
    return `${request.protocol}://${request.host}${request.originalUrl}`;
  }

  try {
    const base = new URL(backendUrl);
    // Preserve the exact encoded path/query signed by Twilio. Never use forwarded
    // host/protocol headers to choose the trusted public origin.
    if (['http:', 'https:'].includes(base.protocol)) {
      return `${base.origin}${request.originalUrl}`;
    }
  } catch {
    // Report malformed configuration with the same typed error as an invalid scheme.
  }
  throw new AppException(
    'VOICE_WEBHOOK_NOT_CONFIGURED',
    'The server voice callback address is invalid.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
