"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdCampaignsTable } from "../ad-campaigns-table";
import { META_AD_GOALS, META_ADS_CAMPAIGNS } from "@/lib/meta-ads";
import { EXTERNAL_REVIEWS, type ExternalReview } from "@/lib/reviews";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FEATURABLE_REVIEWS = EXTERNAL_REVIEWS.filter((r) => r.rating >= 4);

function BrandedCreative({ review, format }: { review: ExternalReview; format: "feed" | "story" }) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-[var(--radius-noxtill)] bg-primary p-4 text-primary-foreground",
        format === "feed" ? "aspect-square" : "aspect-[9/16] max-w-[160px]",
      )}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Sunset Hair Studio</p>
        <p className="mt-2 text-accent">{"★".repeat(review.rating)}</p>
      </div>
      <p className="font-display text-lg font-bold leading-snug">&ldquo;{review.text}&rdquo;</p>
      <p className="text-xs opacity-70">— {review.author}</p>
    </div>
  );
}

export function MetaAdsView({ currency }: { currency: string }) {
  const [goal, setGoal] = useState(META_AD_GOALS[0]);
  const [budget, setBudget] = useState(15);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(FEATURABLE_REVIEWS[0]?.id ?? null);

  const selectedReview = FEATURABLE_REVIEWS.find((r) => r.id === selectedReviewId) ?? null;

  function handleLaunch() {
    toast.success(`Campaign created for "${goal}". Live launch wires up in INT-013.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Meta Ads</h1>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
                {META_AD_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Input label="Daily budget" type="number" min={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} leadingSlot={<span className="text-sm">$</span>} />
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-fg">Turn a review into an ad</p>
            <div className="flex flex-col gap-2">
              {FEATURABLE_REVIEWS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReviewId(r.id)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border p-3 text-start text-sm",
                    selectedReviewId === r.id ? "border-primary bg-primary/6" : "border-border hover:bg-surface-2",
                  )}
                >
                  <p className="text-accent-foreground">{"★".repeat(r.rating)}</p>
                  <p className="mt-0.5 truncate text-fg-muted">{r.text}</p>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleLaunch} disabled={!selectedReview}>
            Launch campaign
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Live preview</p>
          {selectedReview ? (
            <div className="flex gap-3">
              <div>
                <p className="mb-1 text-center text-xs text-fg-faint">Facebook feed</p>
                <BrandedCreative review={selectedReview} format="feed" />
              </div>
              <div>
                <p className="mb-1 text-center text-xs text-fg-faint">Instagram story</p>
                <BrandedCreative review={selectedReview} format="story" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg-faint">Select a review to preview the creative.</p>
          )}
        </div>
      </div>

      <p className="mb-3 text-sm font-medium text-fg">Your campaigns</p>
      <AdCampaignsTable campaigns={META_ADS_CAMPAIGNS} currency={currency} />
    </div>
  );
}
