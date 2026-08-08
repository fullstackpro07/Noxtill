import { create } from "zustand";

interface BranchContextState {
  /** null = no branch selected ("All branches") — apiFetch sends no X-Branch header in that case. */
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
}

/**
 * Not persisted — deliberately resets on reload, matching how the branch switcher already behaved
 * as transient local state before this store existed. Read by apiFetch to attach X-Branch (BE-059's
 * TenancyGuard only honors it for the caller's own business or a direct child, so this is safe to
 * send unconditionally).
 */
export const useBranchContextStore = create<BranchContextState>()((set) => ({
  selectedBranchId: null,
  setSelectedBranchId: (id) => set({ selectedBranchId: id }),
}));
