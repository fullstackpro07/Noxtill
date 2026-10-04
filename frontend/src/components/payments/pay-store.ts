"use client";

import { create } from "zustand";
import type { Scope } from "@/lib/payments-api";

export type MField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "area" | "read" | "checks" | "qr";
  value?: string;
  options?: { v: string; t: string; on?: boolean }[];
  req?: boolean;
  help?: string;
  ph?: string;
  rows?: number;
  af?: boolean;
};

export type MValues = Record<string, string | string[]>;

export interface ModalSpec {
  title: string;
  sub?: string | null;
  steps?: { t: string; fg: string; fw: number }[] | null;
  fields: MField[];
  note?: string | null;
  primaryT: string;
  pBg?: string;
  cancel?: string;
  back?: (() => void) | null;
  /** Return a string to show as the modal error; resolve to close. */
  onSubmit: (v: MValues) => Promise<string | void | "keep">;
}

export interface PayState extends Scope {
  drawer: { kind: string; id: string } | null;
  modal: ModalSpec | null;
  modalErr: string | null;
  busy: boolean;
  toast: string | null;
  sel: string[];
  /** Unsaved settings edits: section → field → value. */
  draft: Record<string, Record<string, unknown>>;
  set: (p: Partial<PayState> | ((s: PayState) => Partial<PayState>)) => void;
  flash: (t: string) => void;
  openModal: (m: ModalSpec) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const usePay = create<PayState>((set) => ({
  tab: "overview",
  env: "live",
  branch: "",
  prov: "",
  cur: "rep",
  period: "30",
  view: {},
  f: {},
  page: {},
  sec: "collection",
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
    toastTimer = setTimeout(() => set({ toast: null }), 4500);
  },
  openModal: (m) => set({ modal: m, modalErr: null }),
  closeModal: () => set({ modal: null, modalErr: null, busy: false }),
}));

export const scopeOf = (s: PayState): Scope => ({ tab: s.tab, env: s.env, branch: s.branch, prov: s.prov, cur: s.cur, period: s.period, view: s.view, f: s.f, page: s.page, sec: s.sec });
