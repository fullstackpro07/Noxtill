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

export interface StaffAnalyticsRow {
  staffUserId: string;
  name: string;
  totalSales: number;
  orders: number;
  avgTicketSize: number;
  noShowCount: number;
  reviewMentionCount: number;
}

/** GET /analytics/staff — real sales/no-show/review-mention figures per staff member, this month. */
export function fetchStaffAnalytics(): Promise<StaffAnalyticsRow[]> {
  return apiFetch<StaffAnalyticsRow[]>("/analytics/staff");
}

export interface LtvBucket {
  label: string;
  count: number;
  minLtv: number;
  maxLtv: number;
}

export interface CustomerAnalyticsSummary {
  totalCustomers: number;
  newCount: number;
  returningCount: number;
  retentionRate: number;
  avgLTV: number;
  ltvDistribution: LtvBucket[];
  atRiskCount: number;
}

/** GET /analytics/customers/summary */
export function fetchCustomerSummary(): Promise<CustomerAnalyticsSummary> {
  return apiFetch<CustomerAnalyticsSummary>("/analytics/customers/summary");
}

export interface CohortCustomer {
  id: string;
  name: string;
  phone: string;
  lifetimeSpend: string | number;
  visitCount: number;
  lastVisitAt: string | null;
}

/** GET /analytics/cohorts/:cohortMonth/customers — the real customers behind one cohort row. */
export function fetchCohortCustomers(cohortMonth: string): Promise<CohortCustomer[]> {
  return apiFetch<CohortCustomer[]>(`/analytics/cohorts/${cohortMonth}/customers`);
}

export interface AtRiskCampaignResult {
  id: string;
  segment: string;
  body: string;
  sentCount: number;
}

/** POST /analytics/customers/message-at-risk — sends a real, quota-checked offer to the lapsed segment. */
export function messageAtRisk(offerText: string): Promise<AtRiskCampaignResult> {
  return apiFetch<AtRiskCampaignResult>("/analytics/customers/message-at-risk", {
    method: "POST",
    body: JSON.stringify({ offerText }),
  });
}
