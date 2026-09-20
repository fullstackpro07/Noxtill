import { apiFetch } from "@/lib/api-client";

export interface ProfitProductRow {
  productId: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  reviewPricing: boolean;
  isTopPerformer: boolean;
  /** Real comparison against the equal-length window immediately before this one. */
  trend: "up" | "down" | "flat";
}

export interface ProfitByProduct {
  windowDays: 30 | 90;
  products: ProfitProductRow[];
}

/** GET /profit/products?window=30|90&branchId= — computed from completed, non-quotation orders in that window. `branchId` omitted means just this business; `"all"` means the caller's whole real branch group; a specific id means one validated sibling branch. */
export function fetchProfitByProduct(window: 30 | 90 = 30, branchId?: string): Promise<ProfitByProduct> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<ProfitByProduct>(`/profit/products?window=${window}${branchParam}`);
}

export interface ProductSuggestion {
  productId: string;
  name: string;
  currentPrice: number;
  suggestedPrice: number;
  currentMargin: number;
  pitch: string;
}

/** GET /profit/products/suggestions?window=30|90&branchId= — a real deterministic target price (to reach a healthier margin) per low-margin product, AI-phrased. */
export function fetchProductSuggestions(window: 30 | 90 = 30, branchId?: string): Promise<ProductSuggestion[]> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<ProductSuggestion[]>(`/profit/products/suggestions?window=${window}${branchParam}`);
}

export interface HourlyRevenue {
  hour: number;
  revenue: number;
  salesCount: number;
  avgTicket: number;
}

export interface WeekdayRevenue {
  day: string;
  revenue: number;
  salesCount: number;
  avgTicket: number;
}

export interface ProfitByTime {
  hourly: HourlyRevenue[];
  weekday: WeekdayRevenue[];
  insight: string;
}

/** GET /profit/time?branchId= — see `fetchProfitByProduct` for what `branchId` means. */
export function fetchProfitByTime(branchId?: string): Promise<ProfitByTime> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<ProfitByTime>(`/profit/time${query}`);
}

export interface PnlCategoryRow {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  /** Real overhead-expense total split proportionally by this category's revenue share — not a tracked per-category figure. */
  allocatedExpenses: number;
  netProfit: number;
  /** Net margin (netProfit / revenue), matching the category's own net profit above. */
  margin: number;
}

export interface PnlTrendPoint {
  month: string;
  revenue: number;
  cogs: number;
  totalExpenses: number;
  wastageCost: number;
  netProfit: number;
}

export const PNL_PERIODS = ["today", "week", "month", "quarter", "year"] as const;
export type PnlPeriod = (typeof PNL_PERIODS)[number];

export interface PnlStatement {
  month: string;
  period: PnlPeriod;
  revenue: number;
  cogs: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  /** Inventory depth fix (UPD-INT-013): real wastage/theft cost for the period, now deducted from netProfit. */
  wastageCost: number;
  netProfit: number;
  /** Real revenue/cost/gross-profit (and a proportionally-allocated share of overhead) per product category, for the selected period. */
  categoryBreakdown: PnlCategoryRow[];
  /** The current calendar month plus the 5 preceding it, always real and period-independent. */
  trend: PnlTrendPoint[];
}

/** GET /profit/pnl?month=YYYY-MM&period=today|week|month|quarter|year&branchId= — `month` anchors the trend's 6 calendar months; `period` scopes the headline figures and category breakdown; `branchId` see `fetchProfitByProduct`. */
export function fetchPnl(month: string, period: PnlPeriod = "month", branchId?: string): Promise<PnlStatement> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<PnlStatement>(`/profit/pnl?month=${month}&period=${period}${branchParam}`);
}

export interface WhatIfResult {
  estimate: string;
  disclaimer: string;
}

/** POST /ai/what-if — a real Claude call scoped to one product's own sales history; never a formula. */
export function whatIf(productId: string, priceDeltaPct: number): Promise<WhatIfResult> {
  return apiFetch<WhatIfResult>("/ai/what-if", {
    method: "POST",
    body: JSON.stringify({ productId, priceDeltaPct }),
  });
}

export interface DeadHoursOfferDraft {
  windowLabel: string;
  offerText: string;
}

/** POST /profit/time/dead-hours-offer — an AI draft grounded in this business's own real slowest window; never sends anything. */
export function generateDeadHoursOffer(): Promise<DeadHoursOfferDraft> {
  return apiFetch<DeadHoursOfferDraft>("/profit/time/dead-hours-offer", { method: "POST" });
}

export interface DeadHoursOfferResult {
  id: string;
  segment: string;
  body: string;
  sentCount: number;
}

/** POST /profit/time/dead-hours-offer/send — the explicit approve step; only this call reaches customers. */
export function sendDeadHoursOffer(segment: string, offerText: string): Promise<DeadHoursOfferResult> {
  return apiFetch<DeadHoursOfferResult>("/profit/time/dead-hours-offer/send", {
    method: "POST",
    body: JSON.stringify({ segment, offerText }),
  });
}
