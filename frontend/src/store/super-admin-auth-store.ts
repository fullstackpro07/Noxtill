import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SuperAdminProfile {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  lastLoginAt: string | null;
}

interface SuperAdminAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  admin: SuperAdminProfile | null;
  hasHydrated: boolean;
  setSession: (s: { accessToken: string; refreshToken: string; admin: SuperAdminProfile }) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
}

/**
 * Super Admin session — deliberately separate from the tenant `useAuthStore` (different tokens,
 * different storage key) and kept in sessionStorage, so it ends when the browser tab closes.
 */
export const useSuperAdminAuth = create<SuperAdminAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      admin: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, admin }) => set({ accessToken, refreshToken, admin }),
      clear: () => set({ accessToken: null, refreshToken: null, admin: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "noxtill-super-admin",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, admin: s.admin }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

export function useAdminCan(permission: string): boolean {
  return useSuperAdminAuth((s) => !!s.admin?.permissions.includes(permission));
}
