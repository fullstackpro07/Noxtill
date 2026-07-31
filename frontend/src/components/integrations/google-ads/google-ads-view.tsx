"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BillingDisclaimerStrip } from "../billing-disclaimer-strip";
import { AdCampaignsTable } from "../ad-campaigns-table";
import { AD_GOALS, GOOGLE_ADS_CAMPAIGNS, forecastClicks } from "@/lib/google-ads";
import { toast } from "@/lib/toast";

const KEYWORD_SUGGESTIONS = ["hair salon near me", "haircut downtown", "balayage specialist", "walk-in salon"];

export function GoogleAdsView({ currency }: { currency: string }) {
  const [goal, setGoal] = useState(AD_GOALS[0]);
  const [dailyBudget, setDailyBudget] = useState(20);
  const [radiusKm, setRadiusKm] = useState(5);
  const [keywords, setKeywords] = useState<string[]>([KEYWORD_SUGGESTIONS[0], KEYWORD_SUGGESTIONS[1]]);

  function toggleKeyword(keyword: string) {
    setKeywords((prev) => (prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword]));
  }

  function handleLaunch() {
    toast.success(`Campaign created for "${goal}". Live launch wires up in INT-013.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-4 font-display text-2xl font-bold text-fg">Google Ads</h1>

      {/* Always visible, regardless of form state — no billing ever touches Noxtill's systems. */}
      <div className="mb-5">
        <BillingDisclaimerStrip />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
                {AD_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Input
                label="Daily budget"
                type="number"
                min={5}
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                leadingSlot={<span className="text-sm">$</span>}
              />
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-fg">Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {KEYWORD_SUGGESTIONS.map((k) => (
                <button
                  key={k}
                  onClick={() => toggleKeyword(k)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    keywords.includes(k) ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-fg">Target radius</p>
              <span className="text-sm text-fg-muted">{radiusKm} km</span>
            </div>
            <input
              type="range"
              min={1}
              max={25}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-3 flex justify-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-primary/40">
                <div
                  className="rounded-full bg-primary/15"
                  style={{ width: `${20 + radiusKm * 3}px`, height: `${20 + radiusKm * 3}px` }}
                />
                <span className="absolute h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          </div>

          <Button onClick={handleLaunch}>Launch campaign</Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-fg">Forecast</p>
            <p className="font-display text-2xl font-bold text-fg">~{forecastClicks(dailyBudget)} clicks/mo</p>
            <p className="text-xs text-fg-faint">Estimate only — actual results vary by competition and season.</p>
          </div>
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-faint">Ad preview</p>
            <p className="text-sm text-primary underline">Sunset Hair Studio — Book Online</p>
            <p className="text-xs text-whatsapp">Ad · sunsethairstudio.com</p>
            <p className="mt-1 text-xs text-fg-muted">{goal} — book your next visit today. Walk-ins welcome.</p>
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm font-medium text-fg">Your campaigns</p>
      <AdCampaignsTable campaigns={GOOGLE_ADS_CAMPAIGNS} currency={currency} />
    </div>
  );
}
