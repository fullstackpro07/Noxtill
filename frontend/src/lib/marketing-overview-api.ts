import { apiFetch } from "@/lib/api-client";

export interface ChannelOverviewRow {
  channel: string;
  spend: number;
  results: number;
  /** null = not applicable for this channel (ad platforms don't report "delivered" the same way). */
  delivered: number | null;
  costPerResult: number | null;
}

export interface MarketingOverviewTotals {
  spend: number;
  results: number;
  delivered: number;
  blendedCostPerResult: number | null;
  /** Real orders that used a coupon or voucher — the only attribution link this schema has. */
  redemptions: number;
  revenue: number;
}

export interface MarketingOverviewResult {
  channels: ChannelOverviewRow[];
  totals: MarketingOverviewTotals;
}

/** GET /marketing/overview (BE-089, extended UPD-BE-105a) — real per-channel spend/results/delivered plus blended totals. */
export function fetchMarketingOverview(): Promise<MarketingOverviewResult> {
  return apiFetch<MarketingOverviewResult>("/marketing/overview");
}

/** POST /marketing/overview/reallocation-suggestion — real AI suggestion grounded in the real channel numbers above. */
export function suggestMarketingReallocation(): Promise<{ suggestion: string }> {
  return apiFetch<{ suggestion: string }>("/marketing/overview/reallocation-suggestion", { method: "POST" });
}
