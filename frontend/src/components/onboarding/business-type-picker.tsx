"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Sparkles, Check, Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchBusinessTypes, aiMapBusinessType } from "@/lib/business-types-api";
import { ApiError } from "@/lib/api-client";

export interface BusinessTypePickerProps {
  value: string | null;
  onChange: (categoryKey: string, label: string) => void;
}

/** Search + real business-type cards + AI one-line-description fallback when nothing matches (FE-005). */
export function BusinessTypePicker({ value, onChange }: BusinessTypePickerProps) {
  const [query, setQuery] = useState("");
  const [aiDescription, setAiDescription] = useState("");

  const { data: types = [], isPending } = useQuery({
    queryKey: ["business-types", query],
    queryFn: () => fetchBusinessTypes(query),
  });
  const noMatches = !isPending && types.length === 0;

  const aiMapMutation = useMutation({
    mutationFn: () => aiMapBusinessType(aiDescription.trim()),
    onSuccess: (matched) => onChange(matched.key, matched.label),
  });

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
          {types.map((type) => {
            const selected = value === type.key;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => onChange(type.key, type.label)}
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
                  <Building2 className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="font-display text-sm font-semibold text-fg">{type.label}</span>
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
                  disabled={!aiDescription.trim() || aiMapMutation.isPending}
                  onClick={() => aiMapMutation.mutate()}
                  className="shrink-0"
                >
                  {aiMapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Match it"}
                </Button>
              </div>
              {aiMapMutation.isSuccess && (
                <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Check className="h-4 w-4" aria-hidden />
                  Got it — set up as &ldquo;{aiMapMutation.data.label}&rdquo;
                </p>
              )}
              {aiMapMutation.isError && (
                <p className="mt-2.5 text-sm text-destructive">
                  {aiMapMutation.error instanceof ApiError ? aiMapMutation.error.message : "Couldn't match this — please try again."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
