"use client";

import { create } from "zustand";
import type { PanelConfig, ConfirmConfig } from "./digitizer-types";

/**
 * UI-only state for the Digitizer overlays. Everything the overlays *show* comes from the API by
 * document id — this store holds no document data, so it cannot go stale or be fabricated.
 */
interface DigitizerState {
  docId: string | null;
  ddSection: string;
  panel: PanelConfig | null;
  confirm: ConfirmConfig | null;
  original: { docId: string; name: string } | null;
  toast: string | null;
  toastSub: string;
  toastTone: "ok" | "error";

  openDoc: (docId: string, section?: string) => void;
  setDocSection: (section: string) => void;
  closeDoc: () => void;

  openPanel: (panel: PanelConfig) => void;
  closePanel: () => void;

  openConfirm: (confirm: ConfirmConfig) => void;
  closeConfirm: () => void;

  openOriginal: (docId: string, name: string) => void;
  closeOriginal: () => void;

  closeOverlays: () => void;

  notify: (title: string, sub?: string) => void;
  notifyError: (title: string, sub?: string) => void;
  closeToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useDigitizerStore = create<DigitizerState>((set) => {
  const show = (toast: string, toastSub: string, toastTone: "ok" | "error") => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast, toastSub, toastTone });
    toastTimer = setTimeout(() => set({ toast: null, toastSub: "" }), toastTone === "error" ? 8000 : 5000);
  };

  return {
    docId: null,
    ddSection: "Document",
    panel: null,
    confirm: null,
    original: null,
    toast: null,
    toastSub: "",
    toastTone: "ok",

    openDoc: (docId, section = "Document") => set({ docId, ddSection: section }),
    setDocSection: (section) => set({ ddSection: section }),
    closeDoc: () => set({ docId: null }),

    openPanel: (panel) => set({ panel }),
    closePanel: () => set({ panel: null }),

    openConfirm: (confirm) => set({ confirm }),
    closeConfirm: () => set({ confirm: null }),

    openOriginal: (docId, name) => set({ original: { docId, name } }),
    closeOriginal: () => set({ original: null }),

    closeOverlays: () => set({ docId: null, panel: null, confirm: null, original: null }),

    notify: (title, sub = "") => show(title, sub, "ok"),
    notifyError: (title, sub = "") => show(title, sub, "error"),

    closeToast: () => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: null, toastSub: "" });
    },
  };
});
