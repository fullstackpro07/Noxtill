"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun, Moon, Copy, Check } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchReviewWidget } from "@/lib/public-review-api";
import { toast } from "@/lib/toast";

type WidgetTheme = "light" | "dark";
type WidgetLayout = "badge" | "carousel" | "grid";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? "/api/v1"
    : process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5000/api/v1");

const EMBED_INSTRUCTIONS: { platform: string; steps: string }[] = [
  { platform: "HTML / custom site", steps: "Paste the snippet just before the closing </body> tag." },
  { platform: "WordPress", steps: "Appearance → Widgets (or a Custom HTML block in the page editor) → paste the snippet." },
  { platform: "Wix", steps: "Add an \"Embed a Widget\" element from the Add panel → Custom Embeds → paste the snippet as HTML iframe." },
  { platform: "Shopify", steps: "Online Store → Themes → Edit code → theme.liquid → paste the snippet just before </body>." },
];

export function WidgetGenerator({ businessSlug }: { businessSlug: string }) {
  const [theme, setTheme] = useState<WidgetTheme>("light");
  const [layout, setLayout] = useState<WidgetLayout>("badge");
  const [minRating, setMinRating] = useState(4);
  const [copied, setCopied] = useState(false);
  // Safe to read directly (no SSR/hydration concern): this component only ever mounts after a
  // user clicks into the "Grow" tab, which is itself a post-hydration client-side interaction —
  // it can never be part of the server-rendered HTML in the first place.
  const origin = window.location.origin;

  const { data } = useQuery({
    queryKey: ["review-widget", businessSlug, minRating],
    queryFn: () => fetchReviewWidget(businessSlug, minRating),
  });
  const reviews = data?.reviews ?? [];
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length : 0;
  const platforms = [...new Set(reviews.map((r) => r.platform))];
  const snippet = `<script src="${origin}/widget.js" data-business="${businessSlug}" data-theme="${theme}" data-layout="${layout}" data-min-rating="${minRating}" data-api="${API_BASE}"></script>`;

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
          <Select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="w-40" aria-label="Minimum rating shown">
            <option value={5}>5★ only</option>
            <option value={4}>4★ and up</option>
            <option value={3}>3★ and up</option>
            <option value={1}>All ratings</option>
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
            {data?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL, not a local/optimizable asset
              <img src={data.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            )}
            <span className="font-display text-2xl font-bold" style={data?.brandColor ? { color: data.brandColor } : undefined}>
              {avg.toFixed(1)}
            </span>
            <span className="text-accent-foreground">{"★".repeat(Math.round(avg))}</span>
          </div>
          <p className="mt-1 text-xs opacity-70">
            {reviews.length > 0
              ? `${reviews.length} review${reviews.length === 1 ? "" : "s"} across ${platforms.join(", ")}`
              : `No reviews at ${minRating}★ or above yet — this widget will populate automatically once you have some.`}
          </p>
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

        <div className="mt-5 flex flex-col gap-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Where to paste it</p>
          {EMBED_INSTRUCTIONS.map((i) => (
            <div key={i.platform} className="text-xs">
              <span className="font-medium text-fg">{i.platform}: </span>
              <span className="text-fg-muted">{i.steps}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
