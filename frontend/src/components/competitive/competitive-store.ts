"use client";

import { create } from "zustand";
import type { CompetitorObservationKind } from "@/lib/competitive-api";
import type { RangeKey } from "@/lib/competitive-insights";

export type CompetitiveDrawer =
  | { type: "brief" }
  | { type: "kpi"; key: string }
  | { type: "change"; id: string }
  | { type: "threat" };

export type CompetitiveModal =
  | { type: "add" }
  | { type: "fresh" }
  | { type: "observe"; competitorId?: string; kind?: CompetitorObservationKind };

export type ProfileTab = "Overview" | "Services" | "Pricing" | "Content" | "Reviews" | "Changes";
export type CompareTab = "Products" | "Services";

/**
 * UI state for the Competitive Insights module. Lives in a store (not React context) because the
 * shared Topbar renders outside the module's own tree — its "Add competitor" / "Checked …" buttons
 * have to be able to open modals that this module renders.
 */
interface CompetitiveUiState {
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  activeCompetitorId: string | null;
  setActiveCompetitor: (id: string | null) => void;
  profileTab: ProfileTab;
  setProfileTab: (t: ProfileTab) => void;
  compareTab: CompareTab;
  setCompareTab: (t: CompareTab) => void;
  drawer: CompetitiveDrawer | null;
  openDrawer: (d: CompetitiveDrawer) => void;
  modal: CompetitiveModal | null;
  openModal: (m: CompetitiveModal) => void;
  closeAll: () => void;
}

export const useCompetitiveUi = create<CompetitiveUiState>((set) => ({
  range: "Last 30 days",
  setRange: (range) => set({ range }),
  activeCompetitorId: null,
  setActiveCompetitor: (activeCompetitorId) => set({ activeCompetitorId }),
  profileTab: "Overview",
  setProfileTab: (profileTab) => set({ profileTab }),
  compareTab: "Products",
  setCompareTab: (compareTab) => set({ compareTab }),
  drawer: null,
  openDrawer: (drawer) => set({ drawer }),
  modal: null,
  openModal: (modal) => set({ modal }),
  closeAll: () => set({ drawer: null, modal: null }),
}));
