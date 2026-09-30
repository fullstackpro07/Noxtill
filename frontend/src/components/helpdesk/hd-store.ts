"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hdApi, type HdConfig } from "@/lib/helpdesk-api";

export interface TicketFilters {
  q: string;
  st: string;
  pri: string;
  ch: string;
  cat: string;
  agent: string;
  queue: string;
  br: string;
  sla: string;
  date: string;
  cust: string;
  tag: string;
}
export const blankTF = (): TicketFilters => ({ q: "", st: "", pri: "", ch: "", cat: "", agent: "", queue: "", br: "", sla: "", date: "", cust: "", tag: "" });

export type Modal = { kind: string; [k: string]: unknown };
export type Drawer = { kind: string; [k: string]: unknown };

interface HdState {
  branch: string;
  range: string;
  toast: string | null;
  modal: Modal | null;
  modalErr: string | null;
  busy: boolean;
  drawer: Drawer | null;
  refreshing: boolean;
  // tickets
  tf: TicketFilters;
  sort: string;
  page: number;
  sel: string[];
  /** Ticket numbers on the current All Tickets page (header "Bulk Actions" selects them). */
  pageNumbers: string[];
  /** Last opened ticket (shows the Ticket Detail tab). */
  cur: string | null;
  ovSeg: string;
  // detail
  tl: string;
  dMore: boolean;
  comp: { mode: "public" | "note"; text: string; files: File[]; after: string; articles: string[] };
  split: string[] | null;
  // other screens
  kbf: { q: string; cat: string; st: string; vis: string; stale: boolean };
  mTab: "macros" | "replies";
  mq: string;
  cf: { rating: string; agent: string };
  af: { agent: string; queue: string; cat: string; pri: string; ch: string };
  sec: string;
  draft: HdConfig | null;
  draftVersion: number;
  addText: Record<string, string>;
  set: (p: Partial<HdState> | ((s: HdState) => Partial<HdState>)) => void;
  flash: (msg: string) => void;
  openModal: (kind: string, extra?: Record<string, unknown>) => void;
  closeModal: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useHd = create<HdState>((set) => ({
  branch: "all",
  range: "30 days",
  toast: null,
  modal: null,
  modalErr: null,
  busy: false,
  drawer: null,
  refreshing: false,
  tf: blankTF(),
  sort: "updated",
  page: 0,
  sel: [],
  pageNumbers: [],
  cur: null,
  ovSeg: "unassigned",
  tl: "all",
  dMore: false,
  comp: { mode: "public", text: "", files: [], after: "", articles: [] },
  split: null,
  kbf: { q: "", cat: "", st: "", vis: "", stale: false },
  mTab: "macros",
  mq: "",
  cf: { rating: "", agent: "" },
  af: { agent: "", queue: "", cat: "", pri: "", ch: "" },
  sec: "general",
  draft: null,
  draftVersion: 0,
  addText: {},
  set: (p) => set((s) => (typeof p === "function" ? p(s) : p)),
  flash: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 3800);
  },
  openModal: (kind, extra) => set({ modal: { kind, ...(extra ?? {}) }, modalErr: null, dMore: false }),
  closeModal: () => set({ modal: null, modalErr: null }),
}));

export const branchParam = (b: string) => (b === "all" ? "all" : b);

export function useWorkspace() {
  const branch = useHd((s) => s.branch);
  return useQuery({ queryKey: ["hd", "workspace", branch], queryFn: () => hdApi.workspace(branchParam(branch)), refetchInterval: 60_000 });
}

/** Refetches every Helpdesk query (after any change, and on Refresh). */
export function useHdInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["hd"] });
}
