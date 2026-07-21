import { randomBytes } from 'crypto';

const TOKEN_BYTES = 16; // -> 32 hex chars, well over the 22-char minimum (spec §6: no enumeration)

/** Single-purpose, non-enumerable review-request token, shared by every code path that creates one. */
export function generateReviewToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}
