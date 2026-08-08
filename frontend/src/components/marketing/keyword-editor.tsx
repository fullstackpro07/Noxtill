"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetchKeywords, addKeyword, removeKeyword, triggerKeywordCheck } from "@/lib/keywords-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function KeywordEditor() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const { data: keywords = [] } = useQuery({ queryKey: ["keywords"], queryFn: fetchKeywords });

  const addMutation = useMutation({
    mutationFn: (keyword: string) => addKeyword(keyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      setDraft("");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't track this keyword — please try again.");
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeKeyword(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["keywords"] }),
  });
  const checkMutation = useMutation({
    mutationFn: (id: string) => triggerKeywordCheck(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keywords"] });
      toast.success("Rank check complete.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't check this keyword's rank right now.");
    },
  });

  function addCurrentDraft() {
    const value = draft.trim();
    if (!value) return;
    addMutation.mutate(value);
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-fg">Tracked keywords</p>
      <div className="mb-3 flex flex-col gap-1.5">
        {keywords.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-fg">
            <span className="truncate">{k.keyword}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-fg-faint">{k.latestRank != null ? `#${k.latestRank}` : "Not ranked yet"}</span>
              <button
                onClick={() => checkMutation.mutate(k.id)}
                disabled={checkMutation.isPending}
                aria-label={`Check rank for ${k.keyword}`}
                className="text-fg-faint hover:text-primary disabled:opacity-60"
              >
                <RefreshCw className={`h-3 w-3 ${checkMutation.isPending ? "animate-spin" : ""}`} aria-hidden />
              </button>
              <button
                onClick={() => removeMutation.mutate(k.id)}
                aria-label={`Remove ${k.keyword}`}
                className="text-fg-faint hover:text-destructive"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          </div>
        ))}
        {keywords.length === 0 && <p className="text-xs text-fg-faint">No keywords tracked yet.</p>}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCurrentDraft())}
          placeholder="Add a keyword to track…"
          className="flex-1"
        />
        <button
          onClick={addCurrentDraft}
          disabled={addMutation.isPending}
          aria-label="Add keyword"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
