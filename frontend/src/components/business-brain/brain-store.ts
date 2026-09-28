"use client";

import { create } from "zustand";
import type { AskAnswer, BrainAction, Compare, FindingCard, SituationView, Signal, Topic } from "@/lib/brain-api";

export type BrainDrawer =
  | { type: "finding"; card: FindingCard }
  | { type: "signal"; signal: Signal }
  | { type: "event"; event: SituationView["events"][number] };

export type BrainModal =
  | { type: "dismiss"; key: string; title: string }
  | { type: "watch-create" }
  | { type: "answer"; answer: AskAnswer }
  | { type: "edit-action"; action: BrainAction }
  | { type: "custom-range" };

interface BrainState {
  /** undefined = this business; "all" = every branch in the group; or a branch id. */
  branch: string | undefined;
  setBranch: (b: string | undefined) => void;
  compare: Compare;
  from: string;
  to: string;
  setCompare: (c: Compare, from?: string, to?: string) => void;
  drawer: BrainDrawer | null;
  openDrawer: (d: BrainDrawer) => void;
  modal: BrainModal | null;
  openModal: (m: BrainModal) => void;
  close: () => void;
  /** A root-cause investigation requested from another screen. */
  cause: { topic?: Topic; q?: string } | null;
  setCause: (c: { topic?: Topic; q?: string } | null) => void;
  attn: string;
  setAttn: (k: string) => void;
  toast: string | null;
  flash: (m: string) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useBrainStore = create<BrainState>((set) => ({
  branch: undefined,
  setBranch: (branch) => set({ branch }),
  compare: "week",
  from: "",
  to: "",
  setCompare: (compare, from = "", to = "") => set({ compare, from, to }),
  drawer: null,
  openDrawer: (drawer) => set({ drawer, modal: null }),
  modal: null,
  openModal: (modal) => set({ modal }),
  close: () => set({ drawer: null, modal: null }),
  cause: null,
  setCause: (cause) => set({ cause }),
  attn: "Everything",
  setAttn: (attn) => set({ attn }),
  toast: null,
  flash: (toast) => {
    set({ toast });
    clearTimeout(timer);
    timer = setTimeout(() => set({ toast: null }), 3200);
  },
}));

/** The scope every Brain query is read for. */
export function useBrainScope() {
  const branch = useBrainStore((s) => s.branch);
  const compare = useBrainStore((s) => s.compare);
  const from = useBrainStore((s) => s.from);
  const to = useBrainStore((s) => s.to);
  return { branch, compare, from: compare === "custom" ? from : undefined, to: compare === "custom" ? to : undefined };
}
