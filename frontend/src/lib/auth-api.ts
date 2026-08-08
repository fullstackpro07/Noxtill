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

export interface MeResponse {
  user: AuthUser;
  business: AuthBusiness;
}

export function signup(payload: SignupPayload): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/auth/signup", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

export function login(payload: LoginPayload): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(payload) }, { skipAuth: true });
}

/** Composes the full session (role + business + branches) — neither /auth/login nor /auth/signup returns this shape directly. */
export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/users/me");
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}
