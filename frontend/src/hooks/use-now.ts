"use client";

import { useEffect, useState } from "react";

/**
 * A `now` timestamp that ticks every `intervalMs` — the one legitimate way to keep a live
 * relative-time display ("5m ago") updating without calling the impure `Date.now()` directly
 * during render (React's purity rule flags that even though it's `useState`-lazy-initialized).
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
