"use client";

import { useEffect, useState } from "react";

/** Portal target inside `.nx-app` (see AppShell) so `var(--app-*)` tokens resolve for portaled
 * content — `document.body` sits outside that scoped class and would silently fail to resolve them.
 * Falls back to `document.body` on the very first render before the target div has mounted. */
export function useNxPortalTarget(): Element | null {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("nx-portal-root") ?? document.body);
  }, []);
  return target;
}
