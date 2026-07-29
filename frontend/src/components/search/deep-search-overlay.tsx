"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSearchStore } from "@/store/search-store";
import { searchAll, groupResults, CATEGORY_LABELS, type SearchResult } from "@/lib/search-index";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 150;

export function DeepSearchOverlay() {
  const open = useSearchStore((s) => s.open);
  const setOpen = useSearchStore((s) => s.setOpen);

  if (!open || typeof document === "undefined") return null;

  // Mounted only while open, so every open starts with fresh query/index state instead of resetting it via an effect.
  return createPortal(<SearchPanel onClose={() => setOpen(false)} />, document.body);
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  const results = useMemo(() => searchAll(debouncedQuery), [debouncedQuery]);
  const grouped = useMemo(() => groupResults(results), [results]);
  const flat = useMemo(() => grouped.flatMap((g) => g.results), [grouped]);

  function handleSelect(result: SearchResult) {
    onClose();
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = flat[activeIndex];
      if (result) handleSelect(result);
    }
  }

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]">
      <button aria-label="Close search" onClick={onClose} className="absolute inset-0 bg-[#1c231e]/45 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-stagger-in relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-noxtill)] border border-border bg-surface shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search customers, orders, products…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {debouncedQuery.trim() === "" ? (
            <p className="py-10 text-center text-sm text-fg-faint">Start typing to search across your business.</p>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-faint">No results for &quot;{debouncedQuery}&quot;.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="mb-2 last:mb-0">
                <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                  {CATEGORY_LABELS[group.category]}
                </p>
                {group.results.map((result) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  return (
                    <button
                      key={result.id}
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => handleSelect(result)}
                      className={cn(
                        "flex w-full flex-col rounded-[var(--radius-sm)] px-2.5 py-2 text-start transition-colors",
                        isActive ? "bg-primary/8" : "hover:bg-surface-2",
                      )}
                    >
                      <span className="truncate text-sm font-medium text-fg">{result.title}</span>
                      <span className="truncate text-xs text-fg-faint">{result.subtitle}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-fg-faint">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
