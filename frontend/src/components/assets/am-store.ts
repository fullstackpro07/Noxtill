"use client";

import { create } from "zustand";
import type { AmScope } from "@/lib/assets-api";

export type AField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "select" | "area" | "read" | "checks" | "file" | "qr";
  value?: string;
  options?: { v: string; t: string; on?: boolean }[];
  req?: boolean;
  help?: string;
  ph?: string;
  rows?: number;
  af?: boolean;
  accept?: string;
};

export type AValues = Record<string, string | string[] | File | null>;

export interface AModal {
  title: string;
  sub?: string | null;
  fields: AField[];
  note?: string | null;
  primaryT: string;
  pBg?: string;
  cancel?: string;
  wide?: boolean;
  /** Return a string to show as the modal error, "keep" to stay open; resolve to close. */
  onSubmit: (v: AValues) => Promise<string | void | "keep">;
}

export interface AmState extends AmScope {
  drawer: { kind: string; id: string; tab?: string } | null;
  modal: AModal | null;
  modalErr: string | null;
  busy: boolean;
  toast: string | null;
  sel: string[];
  /** Settings edits: { config, perms } paths → value. */
  draft: Record<string, unknown>;
  set: (p: Partial<AmState> | ((s: AmState) => Partial<AmState>)) => void;
  flash: (t: string) => void;
  openModal: (m: AModal) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAm = create<AmState>((set) => ({
  tab: "overview",
  branch: "",
  period: "90",
  f: {},
  page: {},
  seg: {},
  cur: "",
  sec: "numbering",
  sort: "num",
  arch: false,
  techAll: false,
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
    toastTimer = setTimeout(() => set({ toast: null }), 5000);
  },
  openModal: (m) => set({ modal: m, modalErr: null }),
  closeModal: () => set({ modal: null, modalErr: null, busy: false }),
}));

export const amScopeOf = (s: AmState): AmScope => ({ tab: s.tab, branch: s.branch, period: s.period, f: s.f, page: s.page, seg: s.seg, cur: s.cur, sec: s.sec, sort: s.sort, arch: s.arch, techAll: s.techAll });

/** Path helpers for the settings draft ("config.numbering.prefix", "perms.assets.create"). */
export function getPath(o: unknown, path: string): unknown {
  const [head, ...rest] = path.split(".");
  if (head === "perms") return (o as { perms?: Record<string, unknown> })?.perms?.[rest.join(".")];
  let cur: unknown = o;
  for (const k of path.split(".")) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
export function setPath<T>(o: T, path: string, v: unknown): T {
  const [head, ...rest] = path.split(".");
  const root = JSON.parse(JSON.stringify(o ?? {})) as Record<string, unknown>;
  if (head === "perms") {
    root.perms = { ...((root.perms as Record<string, unknown>) ?? {}), [rest.join(".")]: v };
    return root as T;
  }
  let cur = root;
  const keys = path.split(".");
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = v;
    else {
      cur[k] = cur[k] ?? (/^\d+$/.test(keys[i + 1]) ? [] : {});
      cur = cur[k] as Record<string, unknown>;
    }
  });
  return root as T;
}
