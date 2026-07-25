"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * Trigger only for FE-002 — the real Deep Search overlay (grouped results,
 * keyboard nav) is FE-032. This wires the Ctrl/⌘K shortcut and shows the
 * expected badge so the affordance is real even before that overlay exists.
 */
export function SearchTrigger() {
  // Server always renders the Ctrl-K fallback (no `navigator` during SSR);
  // detecting the real platform is unavoidably a post-mount effect, not
  // something computable during render — swapping the label in an effect,
  // not a lazy initializer, is what keeps first paint hydration-safe.
  const [mac, setMac] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time platform detection unavailable during SSR, not derived render state
    setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));

    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search-trigger")?.click();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <button
      id="global-search-trigger"
      type="button"
      className="flex h-9 w-full max-w-72 items-center gap-2 rounded-full border border-border-strong bg-surface-2/60 px-3.5 text-sm text-fg-faint transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-start">Search customers, orders…</span>
      <kbd className="hidden shrink-0 rounded-md border border-border-strong bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-fg-faint sm:inline-block">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
