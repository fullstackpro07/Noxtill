import { apiFetch } from "@/lib/api-client";

export interface TaxPeriodFigures {
  period: string;
  taxableSales: number;
  taxCollected: number;
}

export interface TaxRateBreakdownRow {
  ratePercent: number;
  taxableSales: number;
  taxCollected: number;
}

export interface TaxSummary {
  period: string;
  taxLabel: string;
  taxRate: number;
  taxableSales: number;
  taxCollected: number;
  taxOnPurchasesTracked: boolean;
  netTaxDue: number;
  /** Reports depth fix (UPD-INT-015): real per-rate rows for this period, from orders taxed since
   * the rate they were charged started being persisted per line — empty for a period made up
   * entirely of older orders, in which case `taxRate` above is the only figure available. */
  rateBreakdown: TaxRateBreakdownRow[];
  trend: TaxPeriodFigures[];
  nextFilingDate: string;
}

/** GET /reports/tax?period= (UPD-BE-117) — real order aggregates; "tax on purchases" is disclosed as untracked, not fabricated. */
export function fetchTaxSummary(period?: string): Promise<TaxSummary> {
  const qs = period ? `?period=${period}` : "";
  return apiFetch<TaxSummary>(`/reports/tax${qs}`);
}
