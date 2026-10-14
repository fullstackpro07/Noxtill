import { fetchMe, type AuthTokens } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";

/** Only same-site paths are honoured as a post-login destination. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Where a signed-in user belongs right now: confirm email → finish onboarding → the app. */
export function destinationFor(
  user: { emailVerified?: boolean; role: string },
  business: { onboardingCompleted?: boolean },
  next?: string | null,
): string {
  if (user.emailVerified === false) return "/check-email";
  if (business.onboardingCompleted === false && user.role === "owner") return "/onboarding";
  return safeNext(next) ?? "/dashboard";
}

/** Stores tokens, loads the real session (/users/me) and returns where to send the user. */
export async function establishSession(tokens: AuthTokens, next?: string | null): Promise<string> {
  useAuthStore.getState().setTokens(tokens);
  return refreshSession(next);
}

export async function refreshSession(next?: string | null): Promise<string> {
  const { user, business } = await fetchMe();
  const { accessToken, refreshToken } = useAuthStore.getState();
  useAuthStore.getState().setSession({ accessToken: accessToken!, refreshToken: refreshToken!, user, business });
  return destinationFor(user, business, next);
}
