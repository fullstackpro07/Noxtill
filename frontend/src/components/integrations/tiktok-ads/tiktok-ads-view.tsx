"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdCampaignsTable } from "../ad-campaigns-table";
import { TIKTOK_GOALS, SLIDESHOW_STYLES, TIKTOK_ADS_CAMPAIGNS, type SlideshowStyle } from "@/lib/tiktok-ads";
import { PRODUCTS } from "@/lib/products";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SLIDE_PRODUCTS = PRODUCTS.filter((p) => p.active).slice(0, 6);

const STYLE_CLASSES: Record<SlideshowStyle, string> = {
  bold: "bg-fg text-bg font-display text-2xl font-bold uppercase tracking-tight",
  minimal: "bg-surface text-fg font-normal text-base tracking-normal border border-border-strong",
  retro: "bg-accent text-accent-foreground font-display text-xl font-semibold tracking-wide",
};

export function TikTokAdsView({ currency }: { currency: string }) {
  const [goal, setGoal] = useState(TIKTOK_GOALS[0]);
  const [budget, setBudget] = useState(10);
  const [style, setStyle] = useState<SlideshowStyle>("bold");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>(SLIDE_PRODUCTS.slice(0, 3).map((p) => p.id));

  function togglePhoto(id: string) {
    setSelectedPhotoIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 5 ? [...prev, id] : prev));
  }

  function handleLaunch() {
    toast.success(`Slideshow campaign created for "${goal}". Live launch wires up in INT-013.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">TikTok Ads</h1>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
                {TIKTOK_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Input label="Daily budget" type="number" min={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} leadingSlot={<span className="text-sm">$</span>} />
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-fg">Slideshow photos (pick up to 5)</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SLIDE_PRODUCTS.map((p, i) => {
                const selected = selectedPhotoIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePhoto(p.id)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-[6px] p-1 text-center text-[9px] font-medium text-white transition-opacity",
                      !selected && "opacity-35",
                    )}
                    style={{ backgroundColor: `var(--chart-${(i % 5) + 1})` }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Select label="Preview style" value={style} onChange={(e) => setStyle(e.target.value as SlideshowStyle)} className="w-40">
            {SLIDESHOW_STYLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>

          <Button onClick={handleLaunch}>Launch campaign</Button>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-faint">9:16 preview</p>
          <div className={cn("flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-[var(--radius-noxtill)] p-4 text-center", STYLE_CLASSES[style])}>
            <p>{selectedPhotoIds.length} product{selectedPhotoIds.length === 1 ? "" : "s"}</p>
            <p className="text-sm opacity-80">Slideshow ready</p>
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm font-medium text-fg">Your campaigns</p>
      <AdCampaignsTable campaigns={TIKTOK_ADS_CAMPAIGNS} currency={currency} />
    </div>
  );
}
