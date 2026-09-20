"use client";

import { create } from "zustand";
import type { StaticPanel } from "@/components/reports/reports-context";
import type { HubChange } from "@/lib/settings-hub-api";

export type HubPanel =
  | { type: "search"; query?: string }
  | { type: "health" }
  | { type: "ask"; key: string }
  | { type: "history"; category: string }
  | { type: "static"; spec: StaticPanel & { primary?: string; secondary?: string } };

export interface HubConfirm {
  title: string;
  tone: "green" | "amber" | "red";
  icon: string;
  body: string;
  rows?: { label: string; value: string }[];
  primary: string;
  cancel: string;
  onConfirm: () => void | Promise<void>;
}

export interface StagedChange extends HubChange {
  label: string;
  from: string;
  to: string;
}

interface HubState {
  staged: Record<string, StagedChange>;
  stage: (c: StagedChange) => void;
  unstage: (category: string, rowKey: string) => void;
  clearStaged: () => void;
  setting: { category: string; rowKey: string } | null;
  openSetting: (category: string, rowKey: string) => void;
  panel: HubPanel | null;
  openPanel: (p: HubPanel) => void;
  confirm: HubConfirm | null;
  openConfirm: (c: HubConfirm) => void;
  closeOverlays: () => void;
  toast: { title: string; sub: string } | null;
  notify: (title: string, sub?: string) => void;
  closeToast: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  reset: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export const stagedKey = (category: string, rowKey: string) => `${category}|${rowKey}`;

/** A store (not context) because the shared Topbar renders the Save / Discard / Health controls. */
export const useHub = create<HubState>()((set) => ({
  staged: {},
  stage: (c) => set((s) => ({ staged: { ...s.staged, [stagedKey(c.category, c.rowKey)]: c } })),
  unstage: (category, rowKey) =>
    set((s) => {
      const next = { ...s.staged };
      delete next[stagedKey(category, rowKey)];
      return { staged: next };
    }),
  clearStaged: () => set({ staged: {} }),
  setting: null,
  openSetting: (category, rowKey) => set({ setting: { category, rowKey } }),
  panel: null,
  openPanel: (panel) => set({ panel }),
  confirm: null,
  openConfirm: (confirm) => set({ confirm }),
  closeOverlays: () => set({ panel: null, confirm: null, setting: null }),
  toast: null,
  notify: (title, sub) => {
    set({ toast: { title, sub: sub ?? "" } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 5000);
  },
  closeToast: () => set({ toast: null }),
  saving: false,
  setSaving: (saving) => set({ saving }),
  reset: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ staged: {}, setting: null, panel: null, confirm: null, toast: null, saving: false });
  },
}));
