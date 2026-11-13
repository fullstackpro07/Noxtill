/**
 * Security event types and their documented detection/severity rules (Super Admin PRD §11.2).
 *
 * Base severity is fixed per type. Two escalation rules are applied at record time:
 *  - REPEATED_FAILURE: a failed-login type is raised to `high` once the same identifier OR the
 *    same IP has `REPEATED_FAILURE_THRESHOLD` or more failures within `REPEATED_FAILURE_WINDOW_MIN`.
 *  - Admin-side failures are never lower than `high` (the most privileged accounts).
 *
 * Signals Noxtill does NOT detect (and the Security screens say so): geo/"unusual location"
 * (no IP geolocation source is configured), device fingerprinting beyond IP + user agent.
 */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

export const SECURITY_EVENT_TYPES = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_NEW_DEVICE: 'login_new_device',
  LOGIN_FAILED: 'login_failed',
  LOGIN_UNKNOWN_ACCOUNT: 'login_unknown_account',
  ACCOUNT_LOCKED: 'account_locked',
  LOGIN_BLOCKED_SUSPENDED: 'login_blocked_suspended',
  TWO_FACTOR_FAILED: 'two_factor_failed',
  TWO_FACTOR_ENABLED: 'two_factor_enabled',
  TWO_FACTOR_DISABLED: 'two_factor_disabled',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  SESSION_REVOKED: 'session_revoked',
  PERMISSION_DENIED: 'permission_denied',
  RATE_LIMITED: 'rate_limited',
  ACCESS_BLOCKED: 'access_blocked',
  ADMIN_LOGIN_SUCCESS: 'admin_login_success',
  ADMIN_LOGIN_FAILED: 'admin_login_failed',
  ADMIN_LOCKED: 'admin_locked',
  ADMIN_TOTP_FAILED: 'admin_totp_failed',
  ADMIN_TOTP_ENROLLED: 'admin_totp_enrolled',
  ADMIN_SESSION_REVOKED: 'admin_session_revoked',
  // Auth & Social Login spec §8.1: provider/passkey sign-in, linking and credential changes.
  LOGIN_PROVIDER_FAILED: 'login_provider_failed',
  IDENTITY_LINKED: 'identity_linked',
  IDENTITY_UNLINKED: 'identity_unlinked',
  PASSKEY_ADDED: 'passkey_added',
  PASSKEY_REMOVED: 'passkey_removed',
} as const;

export type SecurityEventType =
  (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES];

export const BASE_SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  login_success: 'low',
  login_new_device: 'medium',
  login_failed: 'low',
  login_unknown_account: 'low',
  account_locked: 'high',
  login_blocked_suspended: 'medium',
  two_factor_failed: 'medium',
  two_factor_enabled: 'medium',
  two_factor_disabled: 'high',
  password_reset_requested: 'low',
  password_reset_completed: 'medium',
  session_revoked: 'low',
  permission_denied: 'low',
  rate_limited: 'medium',
  access_blocked: 'medium',
  admin_login_success: 'low',
  admin_login_failed: 'high',
  admin_locked: 'critical',
  admin_totp_failed: 'high',
  admin_totp_enrolled: 'medium',
  admin_session_revoked: 'low',
  login_provider_failed: 'low',
  identity_linked: 'medium',
  identity_unlinked: 'medium',
  passkey_added: 'medium',
  passkey_removed: 'medium',
};

/** Types counted by the REPEATED_FAILURE rule. */
export const FAILURE_TYPES: SecurityEventType[] = [
  'login_failed',
  'login_unknown_account',
  'login_provider_failed',
  'two_factor_failed',
  'admin_login_failed',
  'admin_totp_failed',
];

export const REPEATED_FAILURE_THRESHOLD = 5;
export const REPEATED_FAILURE_WINDOW_MIN = 15;

export const SEVERITY_RANK: Record<SecuritySeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
