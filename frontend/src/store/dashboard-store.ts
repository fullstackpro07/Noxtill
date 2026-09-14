import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LAYOUT } from "@/lib/widgets";

export type DashboardRange = 7 | 30 | 90;

export type OverviewRangeKey = "today" | "week" | "month";
export const OVERVIEW_RANGE_DAYS: Record<OverviewRangeKey, number> = { today: 1, week: 7, month: 30 };
export const OVERVIEW_RANGE_LABEL: Record<OverviewRangeKey, string> = { today: "Today", week: "This week", month: "This month" };

interface DashboardState {
  layout: string[];
  draftLayout: string[] | null;
  range: DashboardRange;
  overviewRange: OverviewRangeKey;
  setOverviewRange: (range: OverviewRangeKey) => void;
  isCustomizing: boolean;
  setRange: (range: DashboardRange) => void;
  /** Overwrites the layout wholesale — used to hydrate from the server's saved dashboard config (INT-002). */
  setLayout: (layout: string[]) => void;
  enterCustomize: () => void;
  reorderDraft: (layout: string[]) => void;
  moveDraftWidget: (key: string, direction: -1 | 1) => void;
  resetDraftToDefault: () => void;
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
      overviewRange: "today",
      isCustomizing: false,

      setRange: (range) => set({ range }),
      setOverviewRange: (overviewRange) => set({ overviewRange }),

      setLayout: (layout) => set({ layout }),

      enterCustomize: () => set({ isCustomizing: true, draftLayout: get().layout }),

      reorderDraft: (layout) => set({ draftLayout: layout }),

      moveDraftWidget: (key, direction) =>
        set((s) => {
          const list = s.draftLayout ?? s.layout;
          const i = list.indexOf(key);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= list.length) return {};
          const next = list.slice();
          [next[i], next[j]] = [next[j], next[i]];
          return { draftLayout: next };
        }),

      resetDraftToDefault: () => set({ draftLayout: DEFAULT_LAYOUT }),

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
