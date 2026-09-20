"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type DrawerState =
  | { mode: "setup"; branchId: string | null }
  | { mode: "drill"; branchId: string }
  | { mode: "transfer" }
  | { mode: "hours"; branchId: string }
  | null;

interface BranchDrawerContextValue {
  drawer: DrawerState;
  openSetup: (branchId?: string) => void;
  openDrill: (branchId: string) => void;
  openTransfer: () => void;
  openHours: (branchId: string) => void;
  close: () => void;
}

const BranchDrawerContext = createContext<BranchDrawerContextValue | null>(null);

export function BranchDrawerProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const value = useMemo<BranchDrawerContextValue>(
    () => ({
      drawer,
      openSetup: (branchId) => setDrawer({ mode: "setup", branchId: branchId ?? null }),
      openDrill: (branchId) => setDrawer({ mode: "drill", branchId }),
      openTransfer: () => setDrawer({ mode: "transfer" }),
      openHours: (branchId) => setDrawer({ mode: "hours", branchId }),
      close: () => setDrawer(null),
    }),
    [drawer],
  );

  return <BranchDrawerContext.Provider value={value}>{children}</BranchDrawerContext.Provider>;
}

export function useBranchDrawer(): BranchDrawerContextValue {
  const ctx = useContext(BranchDrawerContext);
  if (!ctx) throw new Error("useBranchDrawer must be used within BranchDrawerProvider");
  return ctx;
}
