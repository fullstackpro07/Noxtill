"use client";

import { create } from "zustand";
import type { ReportKind } from "@/lib/reports";
import type { TaxRow } from "@/lib/tax-reports-api";
import type { DataExportRequest } from "@/lib/data-exports-api";
import { useSession } from "@/lib/session";
import { useBranchContextStore } from "@/store/branch-context-store";
import { currentPeriod, type Tone } from "./reports-ui";

export type DrawerSection = "Summary" | "Configuration" | "Metrics" | "Sources" | "Validation" | "Lineage" | "Delivery" | "Versions" | "Audit";

export interface StaticPanel {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  rows: { label: string; value: string; tone?: "pos" | "neg" | "neutral" }[];
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
}

export type PanelState =
  | { type: "send"; runId: string; name: string; periodLabel: string }
  | { type: "explain"; runId: string; name: string }
  | { type: "ai"; request?: string }
  | { type: "builder" }
  | { type: "failure"; runId: string }
  | { type: "schedule-new"; kind?: ReportKind }
  | { type: "schedule"; id: string }
  | { type: "tax-record"; period: string }
  | { type: "tax-issue"; issueKey: string }
  | { type: "tax-row"; row: TaxRow }
  | { type: "tax-settings" }
  | { type: "export-job"; id: string }
  | { type: "export-preview"; request: DataExportRequest }
  | { type: "static"; spec: StaticPanel };

export interface ConfirmState {
  title: string;
  tone: "green" | "amber" | "red";
  icon: string;
  body: string;
  rows?: { label: string; value: string }[];
  primary: string;
  cancel: string;
  onConfirm: () => void | Promise<void>;
  /** When set, the cancel button runs this instead of only closing. */
  onCancel?: () => void;
}

interface ToastState {
  title: string;
  sub: string;
}

interface ReportsState {
  period: string;
  setPeriod: (p: string) => void;
  panel: PanelState | null;
  openPanel: (p: PanelState) => void;
  confirm: ConfirmState | null;
  openConfirm: (c: ConfirmState) => void;
  drawer: { runId: string; section: DrawerSection } | null;
  openDrawer: (runId: string, section?: DrawerSection) => void;
  setDrawerSection: (s: DrawerSection) => void;
  viewerRunId: string | null;
  openViewer: (runId: string) => void;
  closeViewer: () => void;
  closeOverlays: () => void;
  toast: ToastState | null;
  notify: (title: string, sub?: string) => void;
  closeToast: () => void;
  reset: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A store rather than React context: the header's period pill, AI-builder bar and action buttons
 * are rendered by the shared Topbar (outside this module's component tree) and must open the same
 * panels the screens do.
 */
export const useReports = create<ReportsState>()((set) => ({
  period: currentPeriod(),
  setPeriod: (period) => set({ period }),
  panel: null,
  openPanel: (panel) => set({ panel }),
  confirm: null,
  openConfirm: (confirm) => set({ confirm }),
  drawer: null,
  openDrawer: (runId, section = "Summary") => set({ drawer: { runId, section } }),
  setDrawerSection: (section) => set((s) => (s.drawer ? { drawer: { ...s.drawer, section } } : {})),
  viewerRunId: null,
  // The document viewer replaces whatever else is open, as in the design.
  openViewer: (runId) => set({ viewerRunId: runId, drawer: null, panel: null }),
  closeViewer: () => set({ viewerRunId: null }),
  closeOverlays: () => set({ panel: null, confirm: null, drawer: null }),
  toast: null,
  notify: (title, sub) => {
    set({ toast: { title, sub: sub ?? "" } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 5000);
  },
  closeToast: () => set({ toast: null }),
  reset: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ period: currentPeriod(), panel: null, confirm: null, drawer: null, viewerRunId: null, toast: null });
  },
}));

/** The business a report is actually built for: the selected branch, else the signed-in business. */
export function useActiveBusinessName(): string {
  const session = useSession();
  const branchId = useBranchContextStore((s) => s.selectedBranchId);
  const branch = branchId ? session.business.branches.find((b) => b.id === branchId) : undefined;
  return branch?.name ?? session.business.name;
}
