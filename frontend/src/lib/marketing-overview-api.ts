import { apiFetch } from "@/lib/api-client";

export interface ChannelOverviewRow {
  channel: string;
  spend: number;
  results: number;
  costPerResult: number | null;
}

/** GET /marketing/overview (BE-089) — real per-channel spend/results aggregation. */
export function fetchMarketingOverview(): Promise<ChannelOverviewRow[]> {
  return apiFetch<ChannelOverviewRow[]>("/marketing/overview");
}
