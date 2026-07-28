"use client";

import { useState } from "react";
import { Sun, Moon, Copy, Check } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EXTERNAL_REVIEWS, averageRating } from "@/lib/reviews";
import { toast } from "@/lib/toast";

type WidgetTheme = "light" | "dark";
type WidgetLayout = "badge" | "carousel" | "grid";

export function WidgetGenerator({ businessSlug }: { businessSlug: string }) {
  const [theme, setTheme] = useState<WidgetTheme>("light");
  const [layout, setLayout] = useState<WidgetLayout>("badge");
  const [copied, setCopied] = useState(false);

  const avg = averageRating(EXTERNAL_REVIEWS);
  const snippet = `<script src="https://noxtill.app/widget.js" data-business="${businessSlug}" data-theme="${theme}" data-layout="${layout}"></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Embed snippet copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the snippet manually.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium", theme === "light" ? "bg-surface shadow-[var(--shadow-sm)]" : "text-fg-faint")}
            >
              <Sun className="h-3.5 w-3.5" aria-hidden />
              Light
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium", theme === "dark" ? "bg-surface shadow-[var(--shadow-sm)]" : "text-fg-faint")}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden />
              Dark
            </button>
          </div>
          <Select value={layout} onChange={(e) => setLayout(e.target.value as WidgetLayout)} className="w-36">
            <option value="badge">Badge</option>
            <option value="carousel">Carousel</option>
            <option value="grid">Grid</option>
          </Select>
        </div>

        <div
          className={cn(
            "rounded-[var(--radius-noxtill)] border p-5",
            theme === "dark" ? "border-[#2a352b] bg-[#171f18] text-[#f2ede0]" : "border-border bg-surface text-fg",
          )}
        >
          <p className="text-xs uppercase tracking-wide opacity-60">{layout} widget preview</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
            <span className="text-accent-foreground">{"★".repeat(Math.round(avg))}</span>
          </div>
          <p className="mt-1 text-xs opacity-70">{EXTERNAL_REVIEWS.length} reviews across Google, Facebook &amp; Yelp</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">Embed snippet</p>
        <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 p-3">
          <code className="block overflow-x-auto whitespace-pre-wrap break-all text-xs text-fg-muted">{snippet}</code>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy snippet"}
        </button>
      </div>
    </div>
  );
}
