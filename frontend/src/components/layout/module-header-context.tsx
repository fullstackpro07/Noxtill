"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface ModuleHeaderConfig {
  /** Replaces the Topbar's default nav-derived title (e.g. "New Sale" instead of "Fast Sale").
   * Presence of `title` is what switches the Topbar into "custom" mode: the default greeting
   * line, full-width search bar, quick-add, mail and "Live" pill are swapped out for `subtitle`,
   * `stats`, `actions` and a compact search icon — matching the design, which shows a module's
   * own header content taking over the ONE bar rather than appending to the generic one. */
  title?: ReactNode;
  /** Replaces the Topbar's default greeting line when `title` is set. */
  subtitle?: ReactNode;
  /** Replaces the compact global-search icon with a module-owned search control (e.g. a live
   * query box filtering that module's own list) — for a module whose search is a real page-level
   * filter rather than the generic cross-entity Deep Search overlay. */
  search?: ReactNode;
  /** Extra content rendered inline in the Topbar (e.g. today's-sales stat boxes) — hidden on
   * narrow widths same as the rest of the Topbar's optional row. Only shown in custom mode. */
  stats?: ReactNode;
  /** Extra action(s) rendered in the Topbar's right-hand icon row, before search/notifications
   * (e.g. a module's own "Barcode Scan" button). Only shown in custom mode. */
  actions?: ReactNode;
}

const EMPTY_CONFIG: ModuleHeaderConfig = {};

/** Split into two contexts on purpose: `ConfigContext`'s value changes every time a module updates
 * its header content (so `Topbar` re-renders with it), while `SetterContext`'s value never changes
 * for the provider's lifetime — a `useModuleHeader` effect can depend on the setter without ever
 * being retriggered by an unrelated module's config update, which would otherwise loop. */
const ModuleHeaderConfigContext = createContext<ModuleHeaderConfig>(EMPTY_CONFIG);
const ModuleHeaderSetterContext = createContext<(c: ModuleHeaderConfig | null) => void>(() => {});

/** Makes the ONE shared Topbar adjustable per active module instead of letting each module stack
 * its own bespoke header underneath it. `AppShell` renders this once around `Topbar` + the routed
 * page; a module's layout calls `useModuleHeader({ stats, actions })` to inject its own content
 * into that same Topbar, and the content is cleared automatically on unmount (leaving the plain
 * Topbar) when navigating to a module that doesn't customize it. */
export function ModuleHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<ModuleHeaderConfig>(EMPTY_CONFIG);
  const setConfig = useCallback((c: ModuleHeaderConfig | null) => setConfigState(c ?? EMPTY_CONFIG), []);
  return (
    <ModuleHeaderSetterContext.Provider value={setConfig}>
      <ModuleHeaderConfigContext.Provider value={config}>{children}</ModuleHeaderConfigContext.Provider>
    </ModuleHeaderSetterContext.Provider>
  );
}

export function useModuleHeaderContent(): ModuleHeaderConfig {
  return useContext(ModuleHeaderConfigContext);
}

export function useModuleHeader(config: ModuleHeaderConfig): void {
  const setConfig = useContext(ModuleHeaderSetterContext);
  const { title, subtitle, search, stats, actions } = config;
  useEffect(() => {
    setConfig({ title, subtitle, search, stats, actions });
    return () => setConfig(null);
  }, [setConfig, title, subtitle, search, stats, actions]);
}
