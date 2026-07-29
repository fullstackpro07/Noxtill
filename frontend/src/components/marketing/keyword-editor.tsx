"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TRACKED_KEYWORDS } from "@/lib/competitors";

export function KeywordEditor() {
  const [keywords, setKeywords] = useState<string[]>(TRACKED_KEYWORDS);
  const [draft, setDraft] = useState("");

  function addKeyword() {
    const value = draft.trim();
    if (!value || keywords.includes(value)) return;
    setKeywords((prev) => [...prev, value]);
    setDraft("");
  }

  function removeKeyword(keyword: string) {
    setKeywords((prev) => prev.filter((k) => k !== keyword));
  }

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-fg">Tracked keywords</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <span key={k} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-fg">
            {k}
            <button onClick={() => removeKeyword(k)} aria-label={`Remove ${k}`} className="text-fg-faint hover:text-destructive">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          placeholder="Add a keyword to track…"
          className="flex-1"
        />
        <button
          onClick={addKeyword}
          aria-label="Add keyword"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
