"use client";

import { create } from "zustand";
import type { Step } from "@/lib/finance-api";

export type FieldType = "text" | "number" | "date" | "sel" | "area" | "file";
export interface ModalField {
  k: string;
  l: string;
  type: FieldType;
  opts?: (string | { v: string; l: string })[];
  req?: boolean;
  ph?: string;
  accept?: string;
}
export interface ModalButton {
  l: string;
  kind: "p" | "s" | "d";
  req?: string[];
  dis?: boolean;
  why?: string;
  run: "close" | ((mf: Record<string, string>, files: Record<string, File | null>) => void | Promise<void>);
}
export interface ModalSpec {
  title: string;
  intro?: string;
  introTone?: "info" | "warn" | "bad";
  kv?: [string, string][];
  lines?: { acct: string; dr: string; cr: string }[];
  linesTitle?: string;
  fields?: ModalField[];
  init?: Record<string, string>;
  live?: (mf: Record<string, string>) => { t: string; ok: boolean } | null;
  buttons: ModalButton[];
  wide?: boolean;
}

export interface JbLine {
  acct: string;
  desc: string;
  dr: string;
  cr: string;
  dim: string;
}
export interface JbState {
  id: string | null;
  number?: string;
  v: number;
  date: string;
  ref: string;
  memo: string;
  type: string;
  branch: string;
  currency: string;
  lines: JbLine[];
  reconLineId?: string;
  conflict?: string | null;
}

export interface BillState {
  id: string | null;
  method: "Manual" | "Upload" | "Photo Digitizer" | "Email import";
  vendor: string;
  supplierId: string;
  vinv: string;
  date: string;
  due: string;
  po: string;
  currency: string;
  branch: string;
  lines: { desc: string; acct: string; qty: string; unit: string; amt: string; tax: string; poItemId: string }[];
  notes: string;
  attachment: { key: string; name: string; size: number; type: string } | null;
  conf: Record<string, number> | null;
  basis: string;
  scanning: boolean;
  scanErr: string;
  ocr: Record<string, unknown> | null;
}

export interface Pipe {
  title: string;
  steps: { l: string; state: "todo" | "active" | "done" | "fail" }[];
  done: boolean;
  msg: string;
  tone: "ok" | "warn" | "bad";
}

interface FinState {
  period: string;
  branch: string;
  cur: "base" | "txn";
  adv: boolean;
  q: string;
  seg: Record<string, string>;
  filt: Record<string, string>;
  moreF: boolean;
  more: Record<string, string>;
  drawer: { k: string; id: string; tab: string | null } | null;
  modal: ModalSpec | null;
  mf: Record<string, string>;
  mfiles: Record<string, File | null>;
  mErr: string;
  mBusy: boolean;
  jb: JbState | null;
  jbBusy: boolean;
  bill: BillState | null;
  pipe: Pipe | null;
  toast: string | null;
  reconId: string | null;
  stmt: string;
  cmp: boolean;
  bver: string;
  glAccount: string;
  glSource: string;
  bank: string;
  setSec: string;
  setDraft: Record<string, unknown>;
  set: (p: Partial<FinState> | ((s: FinState) => Partial<FinState>)) => void;
  flash: (msg: string) => void;
  openModal: (m: ModalSpec) => void;
  closeModal: () => void;
  startPipe: (title: string, steps: string[]) => void;
  finishPipe: (msg: string, tone?: "ok" | "warn", serverSteps?: Step[]) => void;
  failPipe: (msg: string, serverSteps?: Step[]) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pipeTimer: ReturnType<typeof setTimeout> | undefined;

export const useFin = create<FinState>((set, get) => ({
  period: "",
  branch: "all",
  cur: "base",
  adv: false,
  q: "",
  seg: {},
  filt: {},
  moreF: false,
  more: {},
  drawer: null,
  modal: null,
  mf: {},
  mfiles: {},
  mErr: "",
  mBusy: false,
  jb: null,
  jbBusy: false,
  bill: null,
  pipe: null,
  toast: null,
  reconId: null,
  stmt: "pl",
  cmp: true,
  bver: "",
  glAccount: "",
  glSource: "",
  bank: "",
  setSec: "",
  setDraft: {},
  set: (p) => set((s) => (typeof p === "function" ? p(s) : p)),
  flash: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 4600);
  },
  openModal: (m) => set({ modal: m, mf: { ...(m.init ?? {}) }, mfiles: {}, mErr: "", mBusy: false }),
  closeModal: () => set({ modal: null, mErr: "", mBusy: false }),
  // The progress card shows what the server is doing: steps stay pending while the request is in
  // flight and are marked from the real result — never advanced on a timer.
  startPipe: (title, steps) => {
    clearTimeout(pipeTimer);
    set({ pipe: { title, steps: steps.map((l, i) => ({ l, state: i === 0 ? "active" : "todo" })), done: false, msg: "", tone: "ok" } });
  },
  finishPipe: (msg, tone = "ok", serverSteps) => {
    const p = get().pipe;
    if (!p) return;
    const steps = serverSteps?.length ? serverSteps.map((s) => ({ l: s.l, state: (s.ok ? "done" : "fail") as "done" | "fail" })) : p.steps.map((s) => ({ ...s, state: "done" as const }));
    set({ pipe: { ...p, steps, done: true, msg, tone } });
    clearTimeout(pipeTimer);
    pipeTimer = setTimeout(() => set({ pipe: null }), 5200);
  },
  failPipe: (msg, serverSteps) => {
    const p = get().pipe;
    if (!p) return;
    let steps: Pipe["steps"];
    if (serverSteps?.length) steps = serverSteps.map((s) => ({ l: s.l, state: (s.ok ? "done" : "fail") as "done" | "fail" }));
    // Without step-level results from the server we can't say which step failed — mark none done.
    else steps = p.steps.map((s) => ({ ...s, state: "todo" as const }));
    set({ pipe: { ...p, steps, done: true, msg, tone: "bad" } });
  },
}));
