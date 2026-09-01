import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/nav-items";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  twoFactorEnabled: boolean;
  role: Role;
  businessUserId: string | null;
}

export interface AuthBusiness {
  id: string;
  name: string;
  slug: string;
  currency: string;
  locale: string;
  timezone: string;
  country: string | null;
  parentId: string | null;
  branches: { id: string; name: string }[];
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  business: AuthBusiness | null;
  /** False until zustand's persist middleware has read localStorage — guards must wait on this before deciding "logged out". */
  hasHydrated: boolean;
  setSession: (data: AuthTokens & { user: AuthUser; business: AuthBusiness }) => void;
  setTokens: (tokens: AuthTokens) => void;
  /** Patches fields on the current user without a full re-login — e.g. 2FA status flipping. */
  updateUser: (patch: Partial<AuthUser>) => void;
  clearSession: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

/**
 * Bearer tokens persisted client-side because that's what the backend's auth module actually issues
 * (no httpOnly cookie support was built — see BE-007/INT-001) — a known tradeoff, not a frontend choice.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      business: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, user, business }) => set({ accessToken, refreshToken, user, business }),
      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null, business: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "noxtill-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        business: state.business,
      }),
    },
  ),
);
