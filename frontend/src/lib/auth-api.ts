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

// ---- Auth & Onboarding (email confirmation, password reset, social sign-in) ----

export interface VerificationStatus {
  email: string | null;
  verified: boolean;
  resendInSeconds: number;
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

export function verifyEmail(token: string): Promise<{ verified: true; email: string | null }> {
  return apiFetch("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }, { skipAuth: true });
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

export function fetchAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  return apiFetch("/auth/providers", {}, { skipAuth: true });
}

export function fetchGoogleAuthUrl(): Promise<{ url: string }> {
  return apiFetch("/auth/google", {}, { skipAuth: true });
}
