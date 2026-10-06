"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = (): Element | null => document.getElementById("nx-portal-root") ?? document.body;
const getServerSnapshot = (): Element | null => null;

/** Portal target inside `.nx-app` (see AppShell) so `var(--app-*)` tokens resolve for portaled
 * content — `document.body` sits outside that scoped class and would silently fail to resolve them.
 * Falls back to `document.body` when the target div has not mounted; null during SSR/hydration. */
export function useNxPortalTarget(): Element | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
