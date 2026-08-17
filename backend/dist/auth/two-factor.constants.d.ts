export declare const TWO_FACTOR_CODE_LENGTH = 6;
export declare const TWO_FACTOR_CODE_TTL_MINUTES = 10;
export declare const TWO_FACTOR_MAX_ATTEMPTS = 5;
export declare const OTP_TEMPLATE_KEY = "otp_code";
export declare const PENDING_2FA_TTL_MINUTES = 10;
export declare const TWO_FACTOR_ERROR_CODES: {
    readonly ALREADY_ENABLED: "two_factor.already_enabled";
    readonly NOT_ENABLED: "two_factor.not_enabled";
    readonly CODE_EXPIRED: "two_factor.code_expired";
    readonly CODE_INVALID: "two_factor.code_invalid";
    readonly TOO_MANY_ATTEMPTS: "two_factor.too_many_attempts";
    readonly PENDING_TOKEN_INVALID: "two_factor.pending_token_invalid";
    readonly NO_IDENTITY: "two_factor.no_identity";
    readonly WRONG_PASSWORD: "two_factor.wrong_password";
};
