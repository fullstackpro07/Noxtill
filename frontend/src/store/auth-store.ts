import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/nav-items";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** True when the user has a second factor (authenticator app or passkey). */
  twoFactorEnabled: boolean;
  /** Auth & Onboarding: false until the emailed verification code is entered. Absent on sessions persisted before this field existed. */
  emailVerified?: boolean;
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
  /** Sidebar keys approved in onboarding; empty/absent = full sidebar. */
  enabledModules?: string[];
  /** False until onboarding Step 5 finishes. Absent on sessions persisted before this field existed. */
  onboardingCompleted?: boolean;
}

interface AuthState {
  /**
   * The session itself lives in HttpOnly cookies JavaScript can't read (auth security spec §8.2).
   * This flag only remembers that we believe a session exists, so guards don't flash the login page;
   * the first API call confirms or clears it.
   */
  isAuthenticated: boolean;
  /** CSRF token for the current session — memory only, re-fetched from /auth/session after a reload. */
  csrfToken: string | null;
  /** Owner without a second factor: only MFA setup is allowed until one is added. */
  mfaSetupRequired: boolean;
  user: AuthUser | null;
  business: AuthBusiness | null;
  /** False until zustand's persist middleware has read localStorage — guards must wait on this before deciding "logged out". */
  hasHydrated: boolean;
  setSession: (data: { user: AuthUser; business: AuthBusiness; csrfToken?: string | null; mfaSetupRequired?: boolean }) => void;
  /** Marks a fresh sign-in (cookies just set) before /users/me has been loaded. */
  markAuthenticated: (data: { csrfToken?: string | null; mfaSetupRequired?: boolean }) => void;
  setCsrfToken: (csrfToken: string | null) => void;
  setMfaSetupRequired: (required: boolean) => void;
  /** Patches fields on the current user without a full re-login — e.g. 2FA status flipping. */
  updateUser: (patch: Partial<AuthUser>) => void;
  clearSession: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      csrfToken: null,
      mfaSetupRequired: false,
      user: null,
      business: null,
      hasHydrated: false,
      setSession: ({ user, business, csrfToken, mfaSetupRequired }) =>
        set((s) => ({
          isAuthenticated: true,
          user,
          business,
          csrfToken: csrfToken ?? s.csrfToken,
          mfaSetupRequired: mfaSetupRequired ?? s.mfaSetupRequired,
        })),
      markAuthenticated: ({ csrfToken, mfaSetupRequired }) =>
        set((s) => ({
          isAuthenticated: true,
          csrfToken: csrfToken ?? s.csrfToken,
          mfaSetupRequired: mfaSetupRequired ?? s.mfaSetupRequired,
        })),
      setCsrfToken: (csrfToken) => set({ csrfToken }),
      setMfaSetupRequired: (mfaSetupRequired) => set({ mfaSetupRequired }),
      updateUser: (patch) => set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),
      clearSession: () => set({ isAuthenticated: false, csrfToken: null, mfaSetupRequired: false, user: null, business: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "noxtill-auth",
      version: 2,
      // v1 persisted bearer tokens in localStorage; they are dropped on upgrade (the server ended
      // those JWT-era sessions anyway).
      migrate: () => ({ isAuthenticated: false, mfaSetupRequired: false, user: null, business: null }) as unknown as AuthState,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      // Never persist anything secret: no tokens, no CSRF token.
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        mfaSetupRequired: state.mfaSetupRequired,
        user: state.user,
        business: state.business,
      }),
    },
  ),
);
