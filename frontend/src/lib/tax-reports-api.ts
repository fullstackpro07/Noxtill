import { apiFetch } from "@/lib/api-client";

export interface TaxPeriodFigures {
  period: string;
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
  trend: TaxPeriodFigures[];
  nextFilingDate: string;
}

/** GET /reports/tax?period= (UPD-BE-117) — real order aggregates; "tax on purchases" is disclosed as untracked, not fabricated. */
export function fetchTaxSummary(period?: string): Promise<TaxSummary> {
  const qs = period ? `?period=${period}` : "";
  return apiFetch<TaxSummary>(`/reports/tax${qs}`);
}
