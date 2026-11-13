import { apiFetch } from "@/lib/api-client";
import type { AuthUser, AuthBusiness } from "@/store/auth-store";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupPayload {
  businessName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password: string;
  country?: string;
  currency?: string;
  locale?: string;
}

export interface LoginPayload {
  emailOrPhone: string;
  password: string;
  /** Unticked → a one-day refresh window. */
  rememberMe?: boolean;
}

/** 2FA is enabled on this account — a real code was just sent; exchange it via `verifyTwoFactorLogin`. */
export interface Pending2fa {
  pending2fa: true;
  tempToken: string;
}

export interface Verify2faPayload {
  tempToken: string;
  code: string;
}

export interface MeResponse {
  user: AuthUser;
  business: AuthBusiness;
}

export function signup(payload: SignupPayload): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/auth/signup", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

export function login(payload: LoginPayload): Promise<AuthTokens | Pending2fa> {
  return apiFetch<AuthTokens | Pending2fa>("/auth/login", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

/** UPD-INT-016 depth fix: the login flow previously had no way to reach this endpoint at all — a
 * real 2FA-enabled account could not actually complete login through the product UI. */
export function verifyTwoFactorLogin(payload: Verify2faPayload): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/auth/2fa/verify", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

/** Composes the full session (role + business + branches) — neither /auth/login nor /auth/signup returns this shape directly. */
export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/users/me");
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
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

export function forgotPassword(email: string): Promise<{ ok: true }> {
  return apiFetch("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }, { skipAuth: true });
}

export function fetchResetTokenStatus(token: string): Promise<{ valid: boolean }> {
  return apiFetch(`/auth/password/reset?token=${encodeURIComponent(token)}`, {}, { skipAuth: true });
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
export type OAuthExchangeResult = AuthTokens | Pending2fa | { needsEmail: true; ticket: string; provider: SocialProvider; name: string | null };

export function exchangeOAuthCode(code: string): Promise<OAuthExchangeResult> {
  return apiFetch("/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ code }) }, { skipAuth: true });
}

export function completeOAuthSignup(ticket: string, email: string): Promise<AuthTokens | Pending2fa> {
  return apiFetch("/auth/oauth/complete", { method: "POST", body: JSON.stringify({ ticket, email }) }, { skipAuth: true });
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
}

export function fetchIdentities(): Promise<IdentitiesResponse> {
  return apiFetch("/auth/identities");
}

/** `password` is only needed when the current sign-in is older than 15 minutes (REAUTH_REQUIRED). */
export function startIdentityLink(provider: SocialProvider, password?: string): Promise<{ url: string }> {
  return apiFetch(`/auth/identities/${provider}/link`, { method: "POST", body: JSON.stringify(password ? { password } : {}) });
}

export function unlinkIdentity(provider: SocialProvider, password?: string): Promise<{ disconnected: true }> {
  return apiFetch(`/auth/identities/${provider}`, { method: "DELETE", body: JSON.stringify(password ? { password } : {}) });
}

export interface PasskeyView {
  id: string;
  label: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function fetchPasskeys(): Promise<PasskeyView[]> {
  return apiFetch("/auth/passkeys");
}

export function renamePasskey(id: string, label: string): Promise<{ id: string; label: string }> {
  return apiFetch(`/auth/passkeys/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
}

export function removePasskey(id: string, password?: string): Promise<{ removed: true }> {
  return apiFetch(`/auth/passkeys/${id}`, { method: "DELETE", body: JSON.stringify(password ? { password } : {}) });
}
