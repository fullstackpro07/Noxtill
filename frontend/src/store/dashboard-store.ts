import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_DASHBOARD_ROW_LAYOUT } from "@/lib/dashboard-rows";

export type DashboardRange = 7 | 30 | 90;

export type OverviewRangeKey = "today" | "week" | "month";
export const OVERVIEW_RANGE_DAYS: Record<OverviewRangeKey, number> = { today: 1, week: 7, month: 30 };
export const OVERVIEW_RANGE_LABEL: Record<OverviewRangeKey, string> = { today: "Today", week: "This week", month: "This month" };

interface DashboardState {
  /** Order of the whole pixel-exact design rows (kpi, insights, overview, ...) — reordering here
   * swaps entire rows' positions, never the cards inside a row. */
  layout: string[];
  draftLayout: string[] | null;
  /** Extra real metric tiles appended onto the end of the KPI row (Add Widget → "KPI Cards"). */
  kpiExtras: string[];
  draftKpiExtras: string[] | null;
  range: DashboardRange;
  overviewRange: OverviewRangeKey;
  setOverviewRange: (range: OverviewRangeKey) => void;
  isCustomizing: boolean;
  setRange: (range: DashboardRange) => void;
  /** Overwrites the layout wholesale — used to hydrate from the server's saved dashboard config. */
  setLayout: (layout: string[]) => void;
  setKpiExtras: (extras: string[]) => void;
  enterCustomize: () => void;
  reorderDraft: (layout: string[]) => void;
  moveDraftWidget: (key: string, direction: -1 | 1) => void;
  resetDraftToDefault: () => void;
  addWidget: (key: string) => void;
  removeWidget: (key: string) => void;
  addKpiExtra: (key: string) => void;
  removeKpiExtra: (key: string) => void;
  saveCustomize: () => void;
  cancelCustomize: () => void;
}

/** Layout persists across sessions; draftLayout/draftKpiExtras only exist while customizing. */
export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      layout: DEFAULT_DASHBOARD_ROW_LAYOUT,
      draftLayout: null,
      kpiExtras: [],
      draftKpiExtras: null,
      range: 30,
      overviewRange: "today",
      isCustomizing: false,

      setRange: (range) => set({ range }),
      setOverviewRange: (overviewRange) => set({ overviewRange }),

      setLayout: (layout) => set({ layout }),
      setKpiExtras: (extras) => set({ kpiExtras: extras }),

      enterCustomize: () => set({ isCustomizing: true, draftLayout: get().layout, draftKpiExtras: get().kpiExtras }),

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

      resetDraftToDefault: () => set({ draftLayout: DEFAULT_DASHBOARD_ROW_LAYOUT, draftKpiExtras: [] }),

      addWidget: (key) =>
        set((s) => (s.draftLayout?.includes(key) ? s : { draftLayout: [...(s.draftLayout ?? []), key] })),

      removeWidget: (key) =>
        set((s) => ({ draftLayout: (s.draftLayout ?? []).filter((k) => k !== key) })),

      addKpiExtra: (key) =>
        set((s) => (s.draftKpiExtras?.includes(key) ? s : { draftKpiExtras: [...(s.draftKpiExtras ?? []), key] })),

      removeKpiExtra: (key) =>
        set((s) => ({ draftKpiExtras: (s.draftKpiExtras ?? []).filter((k) => k !== key) })),

      saveCustomize: () =>
        set((s) => ({
          layout: s.draftLayout ?? s.layout,
          kpiExtras: s.draftKpiExtras ?? s.kpiExtras,
          draftLayout: null,
          draftKpiExtras: null,
          isCustomizing: false,
        })),

      cancelCustomize: () => set({ draftLayout: null, draftKpiExtras: null, isCustomizing: false }),
    }),
    {
      name: "noxtill-dashboard",
      version: 3,
      partialize: (s) => ({ layout: s.layout, kpiExtras: s.kpiExtras, range: s.range }),
      // v3 changes what "layout" means yet again (whole design rows, not individual sections or
      // generic tiles) — any earlier persisted shape is semantically incompatible, so this starts
      // clean rather than trying to map old keys onto the new ones.
      migrate: () => ({ layout: DEFAULT_DASHBOARD_ROW_LAYOUT, kpiExtras: [], range: 30 as DashboardRange }),
    },
  ),
);
