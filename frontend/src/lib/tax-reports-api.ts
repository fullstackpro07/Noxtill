import { apiFetch } from "@/lib/api-client";

export interface TaxRow {
  period: string;
  periodLabel: string;
  rateLabel: string;
  ratePercent: number | null;
  taxable: number;
  /** Null on the "No rate recorded" line: the tax collected on those sales is unknown, not zero. */
  collected: number | null;
  orders: number;
  status: string;
  statusTone: "green" | "blue" | "neutral" | "red";
}

export interface TaxIssue {
  key: "no-rate" | "refunds" | "purchases" | string;
  title: string;
  meta: string;
  count: number;
  tone: "red" | "amber";
}

export interface TaxSummary {
  period: string;
  periodLabel: string;
  taxLabel: string;
  taxRate: number;
  country: string | null;
  currency: string;
  kpis: {
    taxableSales: number;
    taxCollected: number;
    taxOnPurchasesTracked: boolean;
    refundsApproved: { amount: number; count: number };
    netTax: number;
    transactions: number;
    unratedTransactions: number;
  };
  trend: { period: string; label: string; taxCollected: number; partial: boolean }[];
  filing: {
    day: number;
    nextDate: string;
    forPeriod: string;
    forPeriodLabel: string;
    daysUntil: number;
    reminderOn: string | null;
    filedPeriods: { period: string; filedOn: string; reference: string | null; netTaxAtFiling: number }[];
  };
  issues: TaxIssue[];
  rows: TaxRow[];
}

export function fetchTaxSummary(period?: string): Promise<TaxSummary> {
  return apiFetch<TaxSummary>(`/reports/tax${period ? `?period=${period}` : ""}`);
}

export function fetchTaxExcel(period?: string): Promise<{ url: string }> {
  return apiFetch(`/reports/tax/excel${period ? `?period=${period}` : ""}`);
}

export function setTaxFilingDay(filingDay: number): Promise<{ day: number }> {
  return apiFetch("/reports/tax/settings", { method: "PUT", body: JSON.stringify({ filingDay }) });
}

export function recordTaxFiling(input: {
  period: string;
  filedOn: string;
  reference?: string;
  notes?: string;
}): Promise<{ id: string; period: string }> {
  return apiFetch("/reports/tax/filings", { method: "POST", body: JSON.stringify(input) });
}

export function setTaxReminder(period: string): Promise<{ remindOn: string; filingDate: string }> {
  return apiFetch("/reports/tax/reminders", { method: "POST", body: JSON.stringify({ period }) });
}
