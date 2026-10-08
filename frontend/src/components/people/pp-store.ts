"use client";

import { create } from "zustand";
import type { PpScope } from "@/lib/people-api";
import type { AModal } from "@/components/assets/am-store";

export interface PpState extends PpScope {
  drawer: { kind: string; id: string } | null;
  modal: AModal | null;
  modalErr: string | null;
  busy: boolean;
  toast: string | null;
  sel: string[];
  set: (p: Partial<PpState> | ((s: PpState) => Partial<PpState>)) => void;
  flash: (t: string) => void;
  openModal: (m: AModal) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const usePp = create<PpState>((set) => ({
  tab: "overview",
  branch: "",
  dept: "",
  f: {},
  page: {},
  view: {},
  run: "",
  drawer: null,
  modal: null,
  modalErr: null,
  busy: false,
  toast: null,
  sel: [],
  set: (p) => set((s) => (typeof p === "function" ? p(s) : p)),
  flash: (t) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: t });
    toastTimer = setTimeout(() => set({ toast: null }), 7000);
  },
  openModal: (m) => set({ modal: m, modalErr: null, busy: false }),
  closeModal: () => set({ modal: null, modalErr: null, busy: false }),
}));

export const ppScopeOf = (s: PpState): PpScope => ({ tab: s.tab, branch: s.branch, dept: s.dept, f: s.f, page: s.page, view: s.view, run: s.run });
