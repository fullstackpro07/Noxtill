"use client";

import { create } from "zustand";
import type { FsScope } from "@/lib/field-service-api";
import type { AModal } from "@/components/assets/am-store";

export interface FsState extends FsScope {
  drawer: { kind: string; id: string } | null;
  modal: AModal | null;
  modalErr: string | null;
  busy: boolean;
  toast: string | null;
  sel: string[];
  /** Settings edits: "config.x.y" paths → value. */
  draft: Record<string, unknown>;
  set: (p: Partial<FsState> | ((s: FsState) => Partial<FsState>)) => void;
  flash: (t: string) => void;
  openModal: (m: AModal) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useFs = create<FsState>((set) => ({
  tab: "overview",
  zone: "",
  f: {},
  page: {},
  view: {},
  cur: "",
  sec: "services",
  dDay: 0,
  techView: "",
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
    toastTimer = setTimeout(() => set({ toast: null }), 6000);
  },
  openModal: (m) => set({ modal: m, modalErr: null, busy: false }),
  closeModal: () => set({ modal: null, modalErr: null, busy: false }),
}));

export const fsScopeOf = (s: FsState): FsScope => ({ tab: s.tab, zone: s.zone, f: s.f, page: s.page, view: s.view, cur: s.cur, sec: s.sec, dDay: s.dDay, techView: s.techView });
