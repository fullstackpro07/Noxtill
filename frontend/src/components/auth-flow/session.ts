import { fetchMe } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";

/** Only same-site paths are honoured as a post-login destination. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Where a signed-in user belongs right now: confirm email → add a second factor → finish onboarding → the app. */
export function destinationFor(
  user: { emailVerified?: boolean; role: string },
  business: { onboardingCompleted?: boolean },
  next?: string | null,
  mfaSetupRequired = useAuthStore.getState().mfaSetupRequired,
): string {
  if (user.emailVerified === false) return "/check-email";
  if (mfaSetupRequired) return "/setup-mfa";
  if (business.onboardingCompleted === false && user.role === "owner") return "/onboarding";
  return safeNext(next) ?? "/dashboard";
}

/**
 * The server has just set the HttpOnly session cookies (no token ever reaches JavaScript):
 * remember the CSRF token in memory, load the real session (/users/me) and return where to go.
 */
export async function establishSession(
  step: { csrfToken?: string | null; mfaSetupRequired?: boolean },
  next?: string | null,
): Promise<string> {
  useAuthStore.getState().markAuthenticated({ csrfToken: step.csrfToken ?? null, mfaSetupRequired: !!step.mfaSetupRequired });
  return refreshSession(next);
}

export async function refreshSession(next?: string | null): Promise<string> {
  const { user, business } = await fetchMe();
  useAuthStore.getState().setSession({ user, business });
  return destinationFor(user, business, next);
}
