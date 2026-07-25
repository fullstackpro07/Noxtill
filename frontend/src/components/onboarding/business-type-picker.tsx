"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";

export interface BusinessTypePickerProps {
  value: string | null;
  onChange: (categoryKey: string, label: string) => void;
}

/** Search + 12 category cards + AI one-line-description fallback when nothing matches (FE-005). */
export function BusinessTypePicker({ value, onChange }: BusinessTypePickerProps) {
  const [query, setQuery] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUSINESS_CATEGORIES;
    return BUSINESS_CATEGORIES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.examples.toLowerCase().includes(q),
    );
  }, [query]);

  const noMatches = filtered.length === 0;

  async function handleAiMap() {
    if (!aiDescription.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    // Wires to POST /business-types/ai-map (BE-069) in INT-006 — stubbed here so the flow is fully clickable now.
    await new Promise((r) => setTimeout(r, 900));
    setAiResult(aiDescription.trim());
    setAiLoading(false);
    onChange("ai_generated", aiDescription.trim());
  }

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for your business type…"
        leadingSlot={<Search className="h-4 w-4" aria-hidden />}
      />

      {!noMatches && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((category) => {
            const Icon = category.icon;
            const selected = value === category.key;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => onChange(category.key, category.label)}
                className={cn(
                  "group relative flex flex-col items-start gap-2.5 rounded-[var(--radius-noxtill)] border p-4 text-start transition-all",
                  selected
                    ? "border-primary bg-primary/6 shadow-[var(--shadow-sm)]"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                )}
              >
                {selected && (
                  <span className="absolute end-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" aria-hidden />
                  </span>
                )}
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    selected ? "bg-primary text-primary-foreground" : "bg-surface-2 text-fg-muted",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="font-display text-sm font-semibold text-fg">{category.label}</span>
                <span className="text-xs text-fg-faint">{category.examples}</span>
              </button>
            );
          })}
        </div>
      )}

      {noMatches && (
        <div className="mt-4 animate-stagger-in rounded-[var(--radius-noxtill)] border border-accent/30 bg-accent/8 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
              <Sparkles className="h-4.5 w-4.5 text-accent-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-fg">
                Couldn&apos;t find &ldquo;{query}&rdquo; — describe it and we&apos;ll set it up
              </p>
              <p className="mt-0.5 text-sm text-fg-muted">
                One line is enough. Our AI will match it to the closest fit, or create a new type just for you.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="e.g. mobile pet grooming van"
                  className="h-10 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={!aiDescription.trim() || aiLoading}
                  onClick={handleAiMap}
                  className="shrink-0"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Match it"}
                </Button>
              </div>
              {aiResult && (
                <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Check className="h-4 w-4" aria-hidden />
                  Got it — set up as &ldquo;{aiResult}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
