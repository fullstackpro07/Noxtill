"use client";

import { create } from "zustand";
import type { CtScope } from "@/lib/contracts-api";
import type { AModal } from "@/components/assets/am-store";

export interface CtState extends CtScope {
  drawer: { kind: string; id: string } | null;
  modal: AModal | null;
  modalErr: string | null;
  busy: boolean;
  toast: string | null;
  sel: string[];
  /** Settings edits: "config.x.y" paths → value. */
  draft: Record<string, unknown>;
  set: (p: Partial<CtState> | ((s: CtState) => Partial<CtState>)) => void;
  flash: (t: string) => void;
  openModal: (m: AModal) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useCt = create<CtState>((set) => ({
  tab: "overview",
  branch: "",
  f: {},
  page: {},
  view: {},
  cur: "",
  sec: "numbering",
  drawer: null,
  modal: null,
  modalErr: null,
  busy: false,
  toast: null,
  sel: [],
  draft: {},
  set: (p) => set((s) => (typeof p === "function" ? p(s) : p)),
  flash: (t) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: t });
    toastTimer = setTimeout(() => set({ toast: null }), 7000);
  },
  openModal: (m) => set({ modal: m, modalErr: null, busy: false }),
  closeModal: () => set({ modal: null, modalErr: null, busy: false }),
}));

export const ctScopeOf = (s: CtState): CtScope => ({ tab: s.tab, branch: s.branch, f: s.f, page: s.page, view: s.view, cur: s.cur, sec: s.sec });
