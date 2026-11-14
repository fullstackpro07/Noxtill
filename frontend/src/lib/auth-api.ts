import { apiFetch } from "@/lib/api-client";
import type { AuthUser, AuthBusiness } from "@/store/auth-store";

/**
 * Auth security spec v1.0: the session is HttpOnly cookies the browser keeps — no response ever
 * carries a session token. Every sign-in step answers with one of these.
 */
export type SignInStep =
  | { status: "authenticated"; user: { id: string; name: string; email: string | null }; csrfToken: string; mfaSetupRequired: boolean }
  /** Right password, new browser: a 6-digit code was emailed. */
  | { status: "device_code"; ticket: string; email: string }
  /** A second factor is needed. */
  | { status: "mfa"; ticket: string; methods: ("totp" | "passkey" | "recovery")[] };

export interface SignupPayload {
  businessName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password: string;
  country?: string;
  currency?: string;
  locale?: string;
  turnstileToken?: string;
}

export interface LoginPayload {
  emailOrPhone: string;
  password: string;
  /** Unticked → shared device: 15-minute idle, 12-hour maximum session. */
  rememberMe?: boolean;
  turnstileToken?: string;
}

export interface MeResponse {
  user: AuthUser;
  business: AuthBusiness;
}

export function signup(payload: SignupPayload): Promise<Extract<SignInStep, { status: "authenticated" }>> {
  return apiFetch("/auth/signup", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

export function login(payload: LoginPayload): Promise<SignInStep> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

/** New-device code from the email. */
export function verifyLoginDevice(ticket: string, code: string): Promise<SignInStep> {
  return apiFetch("/auth/login/device", { method: "POST", body: JSON.stringify({ ticket, code }) }, { skipAuth: true });
}

/** Authenticator-app code or a recovery code. */
export function verifyLoginMfa(ticket: string, input: { code?: string; recoveryCode?: string }): Promise<SignInStep> {
  return apiFetch("/auth/login/mfa", { method: "POST", body: JSON.stringify({ ticket, ...input }) }, { skipAuth: true });
}

/** Composes the full session (role + business + branches) — neither /auth/login nor /auth/signup returns this shape directly. */
export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/users/me");
}

/** POST + CSRF; the server revokes the session's refresh family and clears the cookies. */
export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" }, { skipAuth: true });
}

export function logoutEverywhere(): Promise<{ revoked: number }> {
  return apiFetch("/auth/logout-all", { method: "POST" });
}

export function fetchSessionInfo(): Promise<{ csrfToken: string | null; mfaSetupRequired: boolean; emailVerified: boolean; stepUpValidUntil: string | null }> {
  return apiFetch("/auth/session");
}

export function stepUp(input: { password?: string; code?: string; recoveryCode?: string }): Promise<{ validUntil: string }> {
  return apiFetch("/auth/step-up", { method: "POST", body: JSON.stringify(input) });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
  return apiFetch("/auth/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
}

// ---- Devices (sessions) ----

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  country: string | null;
  sharedDevice: boolean;
  method: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export function fetchDeviceSessions(): Promise<DeviceSession[]> {
  return apiFetch("/sessions");
}

export function revokeDeviceSession(id: string): Promise<void> {
  return apiFetch(`/sessions/${id}`, { method: "DELETE" });
}

// ---- Second factor (authenticator app + recovery codes) ----

export interface MfaStatus {
  required: boolean;
  totp: boolean;
  totpEnabledAt: string | null;
  passkeys: number;
  recoveryCodesLeft: number;
  enrolled: boolean;
}

export function fetchMfaStatus(): Promise<MfaStatus> {
  return apiFetch("/auth/mfa");
}

export function startTotp(password?: string): Promise<{ secret: string; otpauthUrl: string }> {
  return apiFetch("/auth/mfa/totp/start", { method: "POST", body: JSON.stringify(password ? { password } : {}) });
}

export function confirmTotp(code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
  return apiFetch("/auth/mfa/totp/confirm", { method: "POST", body: JSON.stringify({ code }) });
}

export function disableTotp(password?: string): Promise<{ enabled: false }> {
  return apiFetch("/auth/mfa/totp", { method: "DELETE", body: JSON.stringify(password ? { password } : {}) });
}

export function regenerateRecoveryCodes(password?: string): Promise<{ recoveryCodes: string[] }> {
  return apiFetch("/auth/mfa/recovery-codes", { method: "POST", body: JSON.stringify(password ? { password } : {}) });
}

// ---- Auth & Onboarding (email confirmation code, password reset, social sign-in) ----

export interface VerificationStatus {
  email: string | null;
  verified: boolean;
  resendInSeconds: number;
  /** Digits in the emailed code. */
  codeLength: number;
  /** Minutes an emailed code stays valid. */
  codeTtlMinutes: number;
  /** Non-production only: the last code sent, so signup works without an email provider. */
  devVerifyCode?: string;
}

export interface ResendResult {
  sent: boolean;
  email: string;
  resendInSeconds: number;
}

export function fetchVerificationStatus(): Promise<VerificationStatus> {
  return apiFetch<VerificationStatus>("/auth/verification");
}

export function resendVerification(): Promise<ResendResult> {
  return apiFetch<ResendResult>("/auth/verification/resend", { method: "POST" });
}

export function changeUnverifiedEmail(email: string): Promise<ResendResult> {
  return apiFetch<ResendResult>("/auth/verification/email", { method: "PATCH", body: JSON.stringify({ email }) });
}

/** Confirms the signed-in user's email with the 6-digit code from the verification email. */
export function verifyEmailCode(code: string): Promise<{ verified: true; email: string | null }> {
  return apiFetch("/auth/verify-email", { method: "POST", body: JSON.stringify({ code }) });
}

export function forgotPassword(email: string, turnstileToken?: string): Promise<{ ok: true; message: string }> {
  return apiFetch("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email, turnstileToken }) }, { skipAuth: true });
}

/** POST so the reset token never travels in a URL (spec §7.4). */
export function fetchResetTokenStatus(token: string): Promise<{ valid: boolean }> {
  return apiFetch("/auth/password/reset/status", { method: "POST", body: JSON.stringify({ token }) }, { skipAuth: true });
}

export function resetPassword(token: string, password: string): Promise<{ reset: true }> {
  return apiFetch("/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) }, { skipAuth: true });
}

// ---- Social sign-in & passkeys (auth spec v1.0) ----

export type SocialProvider = "google" | "microsoft" | "facebook";

/** Only methods that are configured and switched on for this environment are true. */
export interface AuthProviders {
  google: boolean;
  microsoft: boolean;
  facebook: boolean;
  passkeys: boolean;
}

export function fetchAuthProviders(): Promise<AuthProviders> {
  return apiFetch("/auth/providers", {}, { skipAuth: true });
}

export function fetchProviderStartUrl(provider: SocialProvider): Promise<{ url: string }> {
  return apiFetch(`/auth/${provider}/start`, {}, { skipAuth: true });
}

/** The callback redirect carries a one-time handoff code, never tokens. */
export type OAuthExchangeResult =
  | SignInStep
  /** The provider shared no email: ask for one. */
  | { status: "needs_email"; ticket: string; provider: SocialProvider; name: string | null }
  /** The email belongs to an account but the provider did not verify it: confirm with an emailed code. */
  | { status: "confirm_link"; ticket: string; provider: SocialProvider; email: string };

export function exchangeOAuthCode(code: string): Promise<OAuthExchangeResult> {
  return apiFetch("/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ code }) }, { skipAuth: true });
}

export function completeOAuthSignup(ticket: string, email: string): Promise<OAuthExchangeResult> {
  return apiFetch("/auth/oauth/complete", { method: "POST", body: JSON.stringify({ ticket, email }) }, { skipAuth: true });
}

export function confirmOAuthLink(ticket: string, code: string): Promise<OAuthExchangeResult> {
  return apiFetch("/auth/oauth/confirm-link", { method: "POST", body: JSON.stringify({ ticket, code }) }, { skipAuth: true });
}

export interface ConnectedProvider {
  provider: SocialProvider;
  label: string;
  enabled: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
}

export interface IdentitiesResponse {
  providers: ConnectedProvider[];
  passkeys: number;
  passkeysEnabled: boolean;
  emailVerified: boolean;
  hasPassword: boolean;
}

export function fetchIdentities(): Promise<IdentitiesResponse> {
  return apiFetch("/auth/identities");
}

/** `password` is only needed when the current sign-in is older than 15 minutes (REAUTH_REQUIRED). */
export function startIdentityLink(provider: SocialProvider, password?: string): Promise<{ url: string }> {
  return apiFetch(`/auth/identities/${provider}/link`, { method: "POST", body: JSON.stringify(password ? { password } : {}) });
}

/** Removing a sign-in method signs out every device, this one included (spec §9.3). */
export function unlinkIdentity(provider: SocialProvider, password?: string): Promise<{ disconnected: true; signedOut: true }> {
  return apiFetch(`/auth/identities/${provider}`, { method: "DELETE", body: JSON.stringify(password ? { password } : {}) });
}

export interface PasskeyView {
  id: string;
  label: string;
  synced: boolean;
  /** Disabled after a signature-counter regression (possible copy). */
  disabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function fetchPasskeys(): Promise<PasskeyView[]> {
  return apiFetch("/auth/passkeys");
}

export function renamePasskey(id: string, label: string): Promise<{ id: string; label: string }> {
  return apiFetch(`/auth/passkeys/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
}

export function removePasskey(id: string, password?: string): Promise<{ removed: true; signedOut: true }> {
  return apiFetch(`/auth/passkeys/${id}`, { method: "DELETE", body: JSON.stringify(password ? { password } : {}) });
}
