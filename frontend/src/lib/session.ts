import { useAuthStore } from "@/store/auth-store";
import type { Role } from "@/lib/nav-items";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  twoFactorEnabled: boolean;
  role: Role;
  /** The staff-scoped BusinessUser row's own id — distinct from `id` (the person). Null if somehow missing a staff link. */
  businessUserId: string | null;
}

export interface SessionBusiness {
  id: string;
  name: string;
  slug: string;
  currency: string;
  locale: string;
  branches: { id: string; name: string }[];
}

export interface Session {
  user: SessionUser;
  business: SessionBusiness;
}

/**
 * Real session, wired to the authenticated user/business from the auth store (INT-001).
 * Every screen built against the old mock-session shape works unchanged — only the data source moved.
 * Must only be called beneath the (app) route group's RequireSession guard, which guarantees a session exists.
 */
export function useSession(): Session {
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);

  if (!user || !business) {
    throw new Error("useSession() called with no authenticated session — this route must be behind RequireSession.");
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      phone: user.phone,
      twoFactorEnabled: user.twoFactorEnabled,
      role: user.role,
      businessUserId: user.businessUserId,
    },
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      currency: business.currency,
      locale: business.locale,
      branches: business.branches,
    },
  };
}
