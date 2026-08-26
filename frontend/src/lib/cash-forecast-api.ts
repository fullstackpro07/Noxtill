import { apiFetch } from "@/lib/api-client";

export interface CashForecastDay {
  date: string;
  inflow: number;
  outflow: number;
  obligationsDue: number;
  netFlow: number;
  cumulativeNet: number;
}

export interface CashForecastResult {
  days: number;
  dailyAvgRevenue: number;
  dailyAvgExpense: number;
  projection: CashForecastDay[];
  shortfallDates: string[];
}

/** GET /cash-forecast?days= — a relative net-flow projection (real trailing-30-day averages plus real recurring obligations), not an absolute bank balance. */
export function fetchCashForecast(days = 30): Promise<CashForecastResult> {
  return apiFetch<CashForecastResult>(`/cash-forecast?days=${days}`);
}

export type RecurringObligationFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

interface RawRecurringObligation {
  id: string;
  name: string;
  amount: string;
  frequency: RecurringObligationFrequency;
  nextDueDate: string;
  category: string | null;
  active: boolean;
}

export interface RecurringObligation {
  id: string;
  name: string;
  amount: number;
  frequency: RecurringObligationFrequency;
  nextDueDate: string;
  category: string | null;
  active: boolean;
}

function toLive(raw: RawRecurringObligation): RecurringObligation {
  return { ...raw, amount: Number(raw.amount) };
}

export async function fetchRecurringObligations(): Promise<RecurringObligation[]> {
  const raw = await apiFetch<RawRecurringObligation[]>("/recurring-obligations");
  return raw.map(toLive);
}

export interface RecurringObligationDraft {
  name: string;
  amount: number;
  frequency: RecurringObligationFrequency;
  nextDueDate: string;
  category?: string;
}

export async function createRecurringObligation(draft: RecurringObligationDraft): Promise<RecurringObligation> {
  const raw = await apiFetch<RawRecurringObligation>("/recurring-obligations", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return toLive(raw);
}

export async function updateRecurringObligation(
  id: string,
  draft: Partial<RecurringObligationDraft & { active: boolean }>,
): Promise<RecurringObligation> {
  const raw = await apiFetch<RawRecurringObligation>(`/recurring-obligations/${id}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });
  return toLive(raw);
}

export function deleteRecurringObligation(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/recurring-obligations/${id}`, { method: "DELETE" });
}
