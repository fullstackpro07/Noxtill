export const TWO_FACTOR_CODE_LENGTH = 6;
export const TWO_FACTOR_CODE_TTL_MINUTES = 10;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;
export const OTP_TEMPLATE_KEY = 'otp_code';
/** Minutes a login's "pending 2FA" token is valid for before the user must log in again. */
export const PENDING_2FA_TTL_MINUTES = 10;

export const TWO_FACTOR_ERROR_CODES = {
  ALREADY_ENABLED: 'two_factor.already_enabled',
  NOT_ENABLED: 'two_factor.not_enabled',
  CODE_EXPIRED: 'two_factor.code_expired',
  CODE_INVALID: 'two_factor.code_invalid',
  TOO_MANY_ATTEMPTS: 'two_factor.too_many_attempts',
  PENDING_TOKEN_INVALID: 'two_factor.pending_token_invalid',
  NO_IDENTITY: 'two_factor.no_identity',
  WRONG_PASSWORD: 'two_factor.wrong_password',
} as const;
