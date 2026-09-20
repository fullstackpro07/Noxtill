"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface BranchesScopeState {
  /** null = All branches. A real branch id otherwise — client-side filter over whichever real
   * per-branch rows a screen already fetched (rollup/dashboard and rollup/compare always return
   * the full group regardless of X-Branch, so "scope" narrows what's shown, not what's fetched). */
  scopeBranchId: string | null;
  setScopeBranchId: (id: string | null) => void;
  /** Trailing-day window sent to `days=`/`weeks=`-accepting endpoints. Only periods the real
   * endpoints can actually serve (a trailing window, not a calendar-anchored one) are offered. */
  periodDays: number;
  periodLabel: string;
  setPeriod: (days: number, label: string) => void;
}

const BranchesScopeContext = createContext<BranchesScopeState | null>(null);

export const PERIOD_OPTIONS: { label: string; days: number }[] = [
  { label: "Today", days: 1 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
  { label: "This quarter", days: 90 },
  { label: "This year", days: 365 },
];

export function BranchesScopeProvider({ children }: { children: ReactNode }) {
  const [scopeBranchId, setScopeBranchId] = useState<string | null>(null);
  const [period, setPeriodState] = useState({ days: 30, label: "This month" });

  const value = useMemo<BranchesScopeState>(
    () => ({
      scopeBranchId,
      setScopeBranchId,
      periodDays: period.days,
      periodLabel: period.label,
      setPeriod: (days: number, label: string) => setPeriodState({ days, label }),
    }),
    [scopeBranchId, period],
  );

  return <BranchesScopeContext.Provider value={value}>{children}</BranchesScopeContext.Provider>;
}

export function useBranchesScope(): BranchesScopeState {
  const ctx = useContext(BranchesScopeContext);
  if (!ctx) throw new Error("useBranchesScope must be used within BranchesScopeProvider");
  return ctx;
}
