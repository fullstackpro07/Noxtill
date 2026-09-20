"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface InventorySearchContextValue {
  query: string;
  setQuery: (q: string) => void;
}

const InventorySearchContext = createContext<InventorySearchContextValue | null>(null);

/** Header owns the one search input (design's `q`/`setQ`, whose placeholder changes per active
 * screen); each screen's own view reads `useInventorySearch().query` to filter its own list —
 * same box, no per-screen duplicate search field. */
export function InventorySearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <InventorySearchContext.Provider value={value}>{children}</InventorySearchContext.Provider>;
}

export function useInventorySearch(): InventorySearchContextValue {
  const ctx = useContext(InventorySearchContext);
  if (!ctx) throw new Error("useInventorySearch must be used within InventorySearchProvider");
  return ctx;
}

type Exporter = (() => void) | null;

/** Split into two contexts on purpose (same reason as `ModuleHeaderProvider`): the setter never
 * changes identity, so `useRegisterExport`'s effect can depend on it without the current exporter
 * value ever being part of that dependency — otherwise a screen registering a fresh (unmemoized)
 * closure every render would update this provider's state, which would re-render that same screen
 * if it also read the current value, which would register a fresh closure again, forever. */
const InventoryExportSetterContext = createContext<((fn: Exporter) => void) | null>(null);
const InventoryExportValueContext = createContext<Exporter>(null);

/** Header owns the one Export button; the active screen registers its own CSV export handler
 * (its own columns/rows) via `useRegisterExport`, same "one shared control, per-screen content"
 * shape as the search box above. */
export function InventoryExportProvider({ children }: { children: ReactNode }) {
  const [exporter, setExporter] = useState<Exporter>(null);
  return (
    <InventoryExportSetterContext.Provider value={setExporter}>
      <InventoryExportValueContext.Provider value={exporter}>{children}</InventoryExportValueContext.Provider>
    </InventoryExportSetterContext.Provider>
  );
}

/** For the header only — reads the current exporter to render/enable the Export button. */
export function useInventoryExport(): { exporter: Exporter } {
  const exporter = useContext(InventoryExportValueContext);
  return { exporter };
}

/** A screen calls this once with its own export handler; it's cleared automatically on unmount so
 * navigating away never leaves a stale exporter wired to the header's Export button. Registers a
 * single stable wrapper on mount (via a ref that always points at the latest `fn`) instead of
 * re-registering on every render — a screen's export closure is rebuilt every render (it captures
 * whatever's currently filtered/visible), so depending on it directly would re-run this effect,
 * and therefore update the shared exporter state, on every one of that screen's renders too. */
export function useRegisterExport(fn: () => void): void {
  const setExporter = useContext(InventoryExportSetterContext);
  if (!setExporter) throw new Error("useRegisterExport must be used within InventoryExportProvider");
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    setExporter(() => () => fnRef.current());
    return () => setExporter(null);
  }, [setExporter]);
}

export type InvDrawerState =
  | { mode: "history"; productId: string }
  | { mode: "po"; supplierId?: string; prefill?: { productId: string; qty: number }[] }
  | { mode: "wastage"; productId?: string }
  | { mode: "rationale"; productId: string }
  | null;

export type InvModalState =
  | { mode: "adjust"; productId: string }
  | { mode: "thresholds"; productIds: string[] }
  | { mode: "waitlist"; productId: string }
  | { mode: "receive"; orderId: string }
  | null;

interface InventoryDrawerContextValue {
  drawer: InvDrawerState;
  modal: InvModalState;
  openHistory: (productId: string) => void;
  openPo: (opts?: { supplierId?: string; prefill?: { productId: string; qty: number }[] }) => void;
  openWastage: (productId?: string) => void;
  openRationale: (productId: string) => void;
  openAdjust: (productId: string) => void;
  openThresholds: (productIds: string[]) => void;
  openWaitlist: (productId: string) => void;
  openReceive: (orderId: string) => void;
  close: () => void;
}

const InventoryDrawerContext = createContext<InventoryDrawerContextValue | null>(null);

export function InventoryDrawerProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<InvDrawerState>(null);
  const [modal, setModal] = useState<InvModalState>(null);

  const value = useMemo<InventoryDrawerContextValue>(
    () => ({
      drawer,
      modal,
      openHistory: (productId) => setDrawer({ mode: "history", productId }),
      openPo: (opts) => setDrawer({ mode: "po", ...opts }),
      openWastage: (productId) => setDrawer({ mode: "wastage", productId }),
      openRationale: (productId) => setDrawer({ mode: "rationale", productId }),
      openAdjust: (productId) => setModal({ mode: "adjust", productId }),
      openThresholds: (productIds) => setModal({ mode: "thresholds", productIds }),
      openWaitlist: (productId) => setModal({ mode: "waitlist", productId }),
      openReceive: (orderId) => setModal({ mode: "receive", orderId }),
      close: () => {
        setDrawer(null);
        setModal(null);
      },
    }),
    [drawer, modal],
  );

  return <InventoryDrawerContext.Provider value={value}>{children}</InventoryDrawerContext.Provider>;
}

export function useInventoryDrawer(): InventoryDrawerContextValue {
  const ctx = useContext(InventoryDrawerContext);
  if (!ctx) throw new Error("useInventoryDrawer must be used within InventoryDrawerProvider");
  return ctx;
}
