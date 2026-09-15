"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useSearchStore } from "@/store/search-store";

/** Ctrl/⌘K shortcut and click both open the Deep Search overlay (FE-032). `compact` renders an
 * icon-only button (same trigger, same shortcut) for headers with no room for the full-width
 * search bar, e.g. a module's custom Topbar row that already carries stat boxes. */
export function SearchTrigger({ compact = false }: { compact?: boolean }) {
  // Server always renders the Ctrl-K fallback (no `navigator` during SSR);
  // detecting the real platform is unavoidably a post-mount effect, not
  // something computable during render — swapping the label in an effect,
  // not a lazy initializer, is what keeps first paint hydration-safe.
  const [mac, setMac] = useState(false);
  const { t } = useTranslation();
  const setOpen = useSearchStore((s) => s.setOpen);

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

  if (compact) {
    return (
      <button
        id="global-search-trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("topbar.searchPlaceholder")}
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <button
      id="global-search-trigger"
      type="button"
      onClick={() => setOpen(true)}
      className="flex h-[42px] w-full max-w-[420px] items-center gap-2.5 rounded-[10px] px-3.5 text-[13px] transition-colors"
      style={{ border: "1px solid var(--app-border, var(--border-strong))", background: "var(--app-surface-2, var(--surface-2))", color: "var(--app-text-disabled, var(--fg-faint))" }}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-start">{t("topbar.searchPlaceholder")}</span>
      <kbd
        className="hidden shrink-0 rounded-[6px] px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline-block"
        style={{ border: "1px solid var(--app-border, var(--border-strong))", background: "var(--app-surface, var(--surface))", color: "var(--app-text-disabled, var(--fg-faint))" }}
      >
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
