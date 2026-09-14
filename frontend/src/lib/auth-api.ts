import { apiFetch } from "@/lib/api-client";
import type { AuthUser, AuthBusiness } from "@/store/auth-store";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupPayload {
  businessName: string;
  name: string;
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
