import { apiFetch } from "@/lib/api-client";

export interface ProfitProductRow {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  reviewPricing: boolean;
  isTopPerformer: boolean;
}

export interface ProfitByProduct {
  windowDays: 30 | 90;
  products: ProfitProductRow[];
}

/** GET /profit/products?window=30|90 — computed from completed, non-quotation orders in that window. */
export function fetchProfitByProduct(window: 30 | 90 = 30): Promise<ProfitByProduct> {
  return apiFetch<ProfitByProduct>(`/profit/products?window=${window}`);
}

export interface HourlyRevenue {
  hour: number;
  revenue: number;
}

export interface WeekdayRevenue {
  day: string;
  revenue: number;
}

export interface ProfitByTime {
  hourly: HourlyRevenue[];
  weekday: WeekdayRevenue[];
  insight: string;
}

export function fetchProfitByTime(): Promise<ProfitByTime> {
  return apiFetch<ProfitByTime>("/profit/time");
}

export interface PnlStatement {
  month: string;
  revenue: number;
  cogs: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
}

/** GET /profit/pnl?month=YYYY-MM */
export function fetchPnl(month: string): Promise<PnlStatement> {
  return apiFetch<PnlStatement>(`/profit/pnl?month=${month}`);
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
