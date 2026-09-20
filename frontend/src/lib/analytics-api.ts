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

export interface BookingsSeriesPoint {
  date: string;
  bookings: number;
}

/** GET /analytics/bookings-series — real per-day appointment counts, for Business Overview's Bookings overlay. */
export function fetchBookingsSeries(days?: number): Promise<BookingsSeriesPoint[]> {
  const query = days ? `?days=${days}` : "";
  return apiFetch<BookingsSeriesPoint[]>(`/analytics/bookings-series${query}`);
}

export interface CohortRow {
  cohortMonth: string;
  size: number;
  retention: number[];
  /** Real all-time lifetime spend of this cohort's own customers. */
  revenue: number;
}

/** `branchId` omitted means just this business; `"all"` means the caller's whole real branch group; a specific id means one validated sibling branch. */
export function fetchCohorts(branchId?: string): Promise<CohortRow[]> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<CohortRow[]>(`/analytics/cohorts${query}`);
}

export interface NewVsReturningPoint {
  month: string;
  newCount: number;
  returningCount: number;
}

/** GET /analytics/customers/new-vs-returning — real distinct-customer split per month (new = first-ever order that month). See `fetchCohorts` for what `branchId` means. */
export function fetchNewVsReturning(branchId?: string): Promise<NewVsReturningPoint[]> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<NewVsReturningPoint[]>(`/analytics/customers/new-vs-returning${query}`);
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
  /** Real BusinessUser.role — "owner" | "manager" | "staff". */
  role: string;
  totalSales: number;
  orders: number;
  avgTicketSize: number;
  noShowCount: number;
  appointmentsCount: number;
  reviewMentionCount: number;
}

/** GET /analytics/staff — real sales/no-show/review-mention figures per staff member. Defaults to
 * this month; pass `month` ("YYYY-MM", UPD-BE-STAFF-08) for an arbitrary past month instead. See
 * `fetchCohorts` for what `branchId` means. */
export function fetchStaffAnalytics(branchId?: string, month?: string): Promise<StaffAnalyticsRow[]> {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  if (month) params.set("month", month);
  const query = params.toString();
  return apiFetch<StaffAnalyticsRow[]>(`/analytics/staff${query ? `?${query}` : ""}`);
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

/** GET /analytics/customers/summary — see `fetchCohorts` for what `branchId` means. */
export function fetchCustomerSummary(branchId?: string): Promise<CustomerAnalyticsSummary> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<CustomerAnalyticsSummary>(`/analytics/customers/summary${query}`);
}

export interface CohortCustomer {
  id: string;
  name: string;
  phone: string;
  lifetimeSpend: string | number;
  visitCount: number;
  lastVisitAt: string | null;
}

/** GET /analytics/cohorts/:cohortMonth/customers — the real customers behind one cohort row. Pass the same `branchId` the cohort grid was fetched with, so the drill-down matches the same scope. */
export function fetchCohortCustomers(cohortMonth: string, branchId?: string): Promise<CohortCustomer[]> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<CohortCustomer[]>(`/analytics/cohorts/${cohortMonth}/customers${query}`);
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
