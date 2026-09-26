"use client";

import { create } from "zustand";

/** Sections of the connection drawer, in the order the design lists them. */
export const DRAWER_SECTIONS = [
  "Overview",
  "Health",
  "Sync activity",
  "Sync log",
  "Field mapping",
  "Permissions",
  "Connected modules",
  "Errors",
  "Audit",
] as const;
export type DrawerSection = (typeof DRAWER_SECTIONS)[number];

export interface StaticPanel {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: "green" | "amber" | "red" | "blue" | "purple" | "neutral";
  rows?: Array<{ label: string; value: string; tone?: "pos" | "neg" | "muted" }>;
  code?: { label: string; text: string };
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
}

export type PanelState =
  | { type: "connect"; key: string }
  | { type: "provider-info"; key: string }
  | { type: "finding"; findingKey: string }
  | { type: "health" }
  | { type: "command" }
  | { type: "request"; providerName?: string }
  | { type: "accounting-mapping" }
  | { type: "accounting-record"; id: string }
  | { type: "conflict"; id?: string }
  | { type: "ecom-order"; id: string }
  | { type: "source-of-truth" }
  | { type: "trigger"; key: string }
  | { type: "subscribe"; provider?: string; trigger?: string }
  | { type: "generate-key" }
  | { type: "key-secret"; name: string; key: string }
  | { type: "api-key"; id: string }
  | { type: "rate-limit" }
  | { type: "webhook-add" }
  | { type: "webhook-secret"; event: string; url: string; secret: string }
  | { type: "delivery"; webhookId: string }
  | { type: "lineage-node"; chain: string; index: number }
  | { type: "mapping-row"; provider: string; index: number }
  | { type: "static"; spec: StaticPanel };

export interface ConfirmState {
  title: string;
  tone: "green" | "amber" | "red";
  icon: string;
  body: string;
  rows?: Array<{ label: string; value: string; tone?: "pos" | "neg" }>;
  primary: string;
  cancel: string;
  /** Optional secondary button (design: "Review the 12" / "Review affected workflows"). */
  review?: { label: string; onClick: () => void };
  onConfirm: () => void | Promise<void>;
}

interface ToastState {
  title: string;
  sub: string;
}

interface IntegrationsState {
  panel: PanelState | null;
  openPanel: (p: PanelState) => void;
  confirm: ConfirmState | null;
  openConfirm: (c: ConfirmState) => void;
  drawer: { key: string; section: DrawerSection } | null;
  openDrawer: (key: string, section?: DrawerSection) => void;
  setDrawerSection: (s: DrawerSection) => void;
  closeOverlays: () => void;
  toast: ToastState | null;
  notify: (title: string, sub?: string) => void;
  closeToast: () => void;
  reset: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A store rather than React context: the header's health pill, command bar and Request button are
 * rendered by the shared Topbar (outside this module's component tree) and must open the same
 * panels the screens do.
 */
export const useIntegrations = create<IntegrationsState>()((set) => ({
  panel: null,
  openPanel: (panel) => set({ panel }),
  confirm: null,
  openConfirm: (confirm) => set({ confirm }),
  drawer: null,
  // Opening a connection replaces any open side panel, as in the design.
  openDrawer: (key, section = "Overview") => set({ drawer: { key, section }, panel: null }),
  setDrawerSection: (section) => set((s) => (s.drawer ? { drawer: { ...s.drawer, section } } : {})),
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
    set({ panel: null, confirm: null, drawer: null, toast: null });
  },
}));
