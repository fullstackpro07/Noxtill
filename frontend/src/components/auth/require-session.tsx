"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

/**
 * Guards every route under the (app) group: redirects to /login when there's no session, and — critically —
 * never renders children while accessToken/user are missing, since every page beneath this calls useSession()
 * unconditionally and that hook throws on a null session (INT-001: "logged-out user redirected").
 *
 * Waits on `hasHydrated` before deciding "logged out": zustand's persist middleware reads localStorage
 * asynchronously after first render, so a real logged-in user refreshing the page would otherwise see a
 * false "no session" on that first render and get redirected before their session even had a chance to load.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const hasSession = Boolean(accessToken && user && business);

  useEffect(() => {
    if (hasHydrated && !hasSession) router.replace("/login");
  }, [hasHydrated, hasSession, router]);

  if (!hasHydrated || !hasSession) return null;

  return <>{children}</>;
}
