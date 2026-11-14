"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { loadSessionInfo } from "@/lib/api-client";
import { StepUpDialog } from "@/components/auth/step-up-dialog";

/**
 * Guards every route under the (app) group: redirects to /login when there's no session, and never
 * renders children while the user/business are missing, since every page beneath this calls
 * useSession() unconditionally and that hook throws on a null session (INT-001).
 *
 * The session itself is an HttpOnly cookie (auth security spec §8.2), so on load this asks the
 * server for the session's CSRF token — which also confirms the cookie is still valid.
 *
 * Waits on `hasHydrated` before deciding "logged out": zustand's persist middleware reads
 * localStorage asynchronously after first render.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const csrfToken = useAuthStore((s) => s.csrfToken);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const hasSession = Boolean(isAuthenticated && user && business);

  // An unconfirmed email goes to Check your email; an owner without a second factor sets one up;
  // an owner whose workspace isn't set up yet goes to onboarding.
  const pending =
    user?.emailVerified === false
      ? "/check-email"
      : mfaSetupRequired
        ? "/setup-mfa"
        : business?.onboardingCompleted === false && user?.role === "owner"
          ? "/onboarding"
          : null;

  useEffect(() => {
    if (!hasHydrated) return;
    if (!hasSession) router.replace("/login");
    else if (pending) router.replace(pending);
  }, [hasHydrated, hasSession, pending, router]);

  useEffect(() => {
    if (hasHydrated && hasSession && !csrfToken) void loadSessionInfo();
  }, [hasHydrated, hasSession, csrfToken]);

  if (!hasHydrated || !hasSession || pending) return null;

  return (
    <>
      {children}
      <StepUpDialog />
    </>
  );
}
