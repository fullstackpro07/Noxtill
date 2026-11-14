import { ConsoleLogger } from '@nestjs/common';

/**
 * Auth security spec §11 "Never log a secret": passwords, OTP codes, tokens, authorization codes,
 * PKCE verifiers and session identifiers are redacted at the logging layer, so a future call site
 * that forgets can't leak them.
 */
const RULES: [RegExp, string][] = [
  // JWTs (header.payload.signature)
  [
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    '[redacted-jwt]',
  ],
  // Bearer credentials
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  // OAuth / one-time values in URLs (authorization codes, state, handoff codes, tokens)
  [
    /([?&#](?:code|state|token|access_token|refresh_token|id_token|ticket|nonce|code_verifier|code_challenge|input_token|appsecret_proof)=)[^&\s#"']+/gi,
    '$1[redacted]',
  ],
  // key=value / "key":"value" pairs for secret-bearing fields
  [
    /\b(password|passwd|new_?password|current_?password|access_?token|refresh_?token|id_?token|temp_?token|otp|code_?verifier|client_?secret|app_?secret|secret|ticket|handoff|nonce|session_?id|authorization|api_?key|recovery_?code|totp_?secret)(["']?\s*[:=]\s*["']?)([^"'&\s,;}]+)/gi,
    '$1$2[redacted]',
  ],
  // Cookie headers carrying session cookies
  [/((?:__Host-)?nx_(?:at|rt|dev)=)[^;\s]+/g, '$1[redacted]'],
  // Bare 6-digit codes next to the words code/OTP
  [/\b(code|otp)\b([^0-9]{0,12})\d{6}\b/gi, '$1$2[redacted]'],
  // Long opaque random tokens (base64url ≥ 32 chars)
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]'],
];

export function scrubSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    return RULES.reduce((s, [re, rep]) => s.replace(re, rep), input);
  }
  if (input instanceof Error) {
    const copy = new Error(scrubSecrets(input.message) as string);
    copy.name = input.name;
    copy.stack = input.stack
      ? (scrubSecrets(input.stack) as string)
      : undefined;
    return copy;
  }
  return input;
}

export class ScrubbingLogger extends ConsoleLogger {
  log(message: unknown, ...rest: unknown[]) {
    super.log(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
  error(message: unknown, ...rest: unknown[]) {
    super.error(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
  warn(message: unknown, ...rest: unknown[]) {
    super.warn(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
  debug(message: unknown, ...rest: unknown[]) {
    super.debug(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
  verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
  fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(scrubSecrets(message), ...rest.map(scrubSecrets));
  }
}
