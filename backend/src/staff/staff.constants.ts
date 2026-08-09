export const STAFF_ERROR_CODES = {
  IDENTITY_REQUIRED: 'STAFF_IDENTITY_REQUIRED',
  ALREADY_STAFF: 'STAFF_ALREADY_STAFF',
  STAFF_NOT_FOUND: 'STAFF_NOT_FOUND',
  CANNOT_MODIFY_OWNER: 'STAFF_CANNOT_MODIFY_OWNER',
  ALREADY_CLOCKED_IN: 'STAFF_ALREADY_CLOCKED_IN',
  NOT_CLOCKED_IN: 'STAFF_NOT_CLOCKED_IN',
} as const;

/**
 * 16 hex chars — deliberately under spec §6's 22-char minimum for bearer tokens/secrets. This is
 * a single-use, human-relayed credential (the owner reads it out to a new hire, who's expected to
 * change it on first real login), not a standing-access token — a 22+ char value would be
 * impractical to relay verbally/via chat for no meaningful security gain. Reviewed and accepted
 * as an exception, not an oversight (INT-015).
 */
export const TEMP_PASSWORD_BYTES = 8;
