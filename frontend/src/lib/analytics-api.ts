import { apiFetch } from "@/lib/api-client";

export interface AnalyticsKpis {
  revenueThisMonth: number;
  grossProfitThisMonth: number;
  ordersThisMonth: number;
  avgOrderValue: number;
  newCustomersThisMonth: number;
  appointmentsBookedThisMonth: number;
  reviewsAverage: number | null;
}

export function fetchKpis(): Promise<AnalyticsKpis> {
  return apiFetch<AnalyticsKpis>("/analytics/kpis");
}

export interface RevenueSeriesPoint {
  date: string;
  orders: number;
  revenue: number;
  grossProfit: number;
}

export function fetchRevenueSeries(days?: number): Promise<RevenueSeriesPoint[]> {
  const query = days ? `?days=${days}` : "";
  return apiFetch<RevenueSeriesPoint[]>(`/analytics/revenue-series${query}`);
}

export interface CohortRow {
  cohortMonth: string;
  size: number;
  retention: number[];
}

export function fetchCohorts(): Promise<CohortRow[]> {
  return apiFetch<CohortRow[]>("/analytics/cohorts");
}

export interface AnalyticsCampaignRow {
  campaignId: string;
  segment: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export function fetchAnalyticsCampaigns(): Promise<AnalyticsCampaignRow[]> {
  return apiFetch<AnalyticsCampaignRow[]>("/analytics/campaigns");
}

export interface ChannelStat {
  channel: string;
  sent: number;
  delivered: number;
}

/** Reshapes the real nested {channel: {status: count}} into the flat rows the ChannelStats component renders. */
export async function fetchChannelStats(days?: number): Promise<ChannelStat[]> {
  const query = days ? `?days=${days}` : "";
  const raw = await apiFetch<Record<string, Record<string, number>>>(`/analytics/channels${query}`);
  return Object.entries(raw).map(([channel, byStatus]) => ({
    channel,
    sent: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    delivered: byStatus.delivered ?? 0,
  }));
}
