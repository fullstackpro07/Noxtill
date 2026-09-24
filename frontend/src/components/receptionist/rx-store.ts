"use client";

import type { ReactNode } from "react";
import { create } from "zustand";
import type { Tone } from "@/lib/receptionist-derive";

export interface PanelRow {
  label: string;
  value: string;
  tone?: "neg" | "pos" | "muted";
}

/** The right-hand detail panel (560px) the design opens from KPI cards, table rows and settings rows. */
export interface PanelSpec {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  answerLabel?: string;
  answer?: string;
  rows?: PanelRow[];
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  /** Extra content between the rows and the bullets — used for real edit forms. */
  body?: ReactNode;
  primary?: string;
  primaryTone?: "green" | "red";
  onPrimary?: () => void | Promise<void>;
  secondary?: string;
}

export interface ConfirmSpec {
  title: string;
  tone: "green" | "amber" | "red";
  icon: string;
  body: string;
  rows?: PanelRow[];
  primary: string;
  cancel: string;
  onConfirm: () => void | Promise<void>;
}

export type CallSection =
  | "Summary"
  | "Transcript"
  | "Caller"
  | "Customer"
  | "Intent"
  | "Actions taken"
  | "Booking"
  | "Order"
  | "Lead"
  | "Knowledge used"
  | "Follow-up"
  | "AI"
  | "Audit";

export const CALL_SECTIONS: CallSection[] = [
  "Summary",
  "Transcript",
  "Caller",
  "Customer",
  "Intent",
  "Actions taken",
  "Booking",
  "Order",
  "Lead",
  "Knowledge used",
  "Follow-up",
  "AI",
  "Audit",
];

export interface Toast {
  title: string;
  sub?: string;
  tone: "ok" | "error";
}

interface RxState {
  panel: PanelSpec | null;
  openPanel: (p: PanelSpec) => void;
  call: { id: string; section: CallSection } | null;
  openCall: (id: string, section?: CallSection) => void;
  setSection: (s: CallSection) => void;
  confirm: ConfirmSpec | null;
  openConfirm: (c: ConfirmSpec) => void;
  toast: Toast | null;
  notify: (title: string, sub?: string, tone?: "ok" | "error") => void;
  closeToast: () => void;
  closeOverlays: () => void;
}

export const useRxStore = create<RxState>((set) => ({
  panel: null,
  openPanel: (panel) => set({ panel }),
  call: null,
  openCall: (id, section = "Summary") => set({ call: { id, section } }),
  setSection: (section) => set((s) => (s.call ? { call: { ...s.call, section } } : s)),
  confirm: null,
  openConfirm: (confirm) => set({ confirm }),
  toast: null,
  notify: (title, sub, tone = "ok") => set({ toast: { title, sub, tone } }),
  closeToast: () => set({ toast: null }),
  closeOverlays: () => set({ panel: null, confirm: null, call: null }),
}));
