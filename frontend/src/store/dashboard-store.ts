import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LAYOUT } from "@/lib/widgets";

export type DashboardRange = 7 | 30 | 90;

interface DashboardState {
  layout: string[];
  draftLayout: string[] | null;
  range: DashboardRange;
  isCustomizing: boolean;
  setRange: (range: DashboardRange) => void;
  enterCustomize: () => void;
  reorderDraft: (layout: string[]) => void;
  addWidget: (key: string) => void;
  removeWidget: (key: string) => void;
  saveCustomize: () => void;
  cancelCustomize: () => void;
}

/** Layout persists across sessions (FE-008 "Save persists order"); draftLayout only exists while customizing. */
export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_LAYOUT,
      draftLayout: null,
      range: 30,
      isCustomizing: false,

      setRange: (range) => set({ range }),

      enterCustomize: () => set({ isCustomizing: true, draftLayout: get().layout }),

      reorderDraft: (layout) => set({ draftLayout: layout }),

      addWidget: (key) =>
        set((s) => (s.draftLayout?.includes(key) ? s : { draftLayout: [...(s.draftLayout ?? []), key] })),

      removeWidget: (key) =>
        set((s) => ({ draftLayout: (s.draftLayout ?? []).filter((k) => k !== key) })),

      saveCustomize: () =>
        set((s) => ({ layout: s.draftLayout ?? s.layout, draftLayout: null, isCustomizing: false })),

      cancelCustomize: () => set({ draftLayout: null, isCustomizing: false }),
    }),
    { name: "noxtill-dashboard", partialize: (s) => ({ layout: s.layout, range: s.range }) },
  ),
);
