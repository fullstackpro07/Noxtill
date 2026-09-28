"use client";

import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWorkspace } from "@/lib/projects-api";

export type Drawer =
  | { kind: "qp"; id: string }
  | { kind: "task"; id: string }
  | { kind: "np"; templateId?: string; type?: string; editId?: string }
  | { kind: "ms"; id: string }
  | { kind: "msnew"; projectId?: string }
  | { kind: "file"; id: string }
  | { kind: "ap"; id: string }
  | { kind: "apnew"; projectId?: string }
  | { kind: "tpl"; id: string }
  | { kind: "tplnew" }
  | { kind: "ai"; tab: "plan" | "risk" | "status"; projectId?: string }
  | null;

export interface Confirm {
  title: string;
  body: string;
  items?: string[];
  ok?: string;
  cancel?: string;
  danger?: boolean;
  run?: () => void | Promise<void>;
  alt?: string;
  altRun?: () => void | Promise<void>;
}

interface ProjectsState {
  scope: "current" | "all";
  setScope: (s: "current" | "all") => void;
  drawer: Drawer;
  open: (d: Drawer) => void;
  close: () => void;
  palette: boolean;
  setPalette: (v: boolean) => void;
  confirm: Confirm | null;
  ask: (c: Confirm | null) => void;
  rejectIds: string[] | null;
  setRejectIds: (ids: string[] | null) => void;
  /** New-project wizard reports unsaved changes so Esc/backdrop asks before discarding. */
  npDirty: boolean;
  setNpDirty: (v: boolean) => void;
  toast: string | null;
  flash: (t: string) => void;
  // cross-screen filters (Overview KPIs and the palette jump into these)
  view: string;
  fHealth: string;
  fStatus: string;
  q: string;
  setProjFilters: (p: Partial<Pick<ProjectsState, "view" | "fHealth" | "fStatus" | "q">>) => void;
  tview: string;
  tq: string;
  setTaskFilters: (p: Partial<Pick<ProjectsState, "tview" | "tq">>) => void;
  msView: string;
  setMsView: (v: string) => void;
  dtab: string;
  setDtab: (v: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useProjectsStore = create<ProjectsState>((set) => ({
  scope: "current",
  setScope: (scope) => set({ scope }),
  drawer: null,
  open: (drawer) => set({ drawer, palette: false }),
  close: () => set({ drawer: null, npDirty: false }),
  palette: false,
  setPalette: (palette) => set({ palette }),
  confirm: null,
  ask: (confirm) => set({ confirm }),
  rejectIds: null,
  setRejectIds: (rejectIds) => set({ rejectIds }),
  npDirty: false,
  setNpDirty: (npDirty) => set({ npDirty }),
  toast: null,
  flash: (toast) => {
    set({ toast });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  view: "All Projects",
  fHealth: "All health",
  fStatus: "All statuses",
  q: "",
  setProjFilters: (p) => set(p),
  tview: "All Tasks",
  tq: "",
  setTaskFilters: (p) => set(p),
  msView: "All",
  setMsView: (msView) => set({ msView }),
  dtab: "overview",
  setDtab: (dtab) => set({ dtab }),
}));

export function useWorkspace() {
  const scope = useProjectsStore((s) => s.scope);
  return useQuery({ queryKey: ["projects-ws", scope], queryFn: () => fetchWorkspace(scope), refetchInterval: 120000 });
}

/** Every Projects query key starts with "projects-" — refresh them all after a write. */
export function useProjectsInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("projects-") });
}
