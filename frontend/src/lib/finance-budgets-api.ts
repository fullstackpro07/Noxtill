import { apiFetch } from '@/lib/api-client';

export interface FinanceBudgetLine {
  category: string;
  actualAmount: string;
  approvedBudget: {
    id: string;
    amount: string;
    version: number;
    reviewedAt: string | null;
  } | null;
  latestRevision: {
    id: string;
    amount: string;
    version: number;
    status: string;
    createdByUserId: string;
    submittedAt: string | null;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
    reviewReason: string | null;
    note: string | null;
  } | null;
  variance: string | null;
  actualPercent: number | null;
}

export interface FinanceBudgetsPeriod {
  month: string;
  currencyCode: string;
  actualsSource: string;
  scope: 'business_wide';
  branchAttribution: 'not_available';
  asOf: string;
  lines: FinanceBudgetLine[];
}

export function fetchFinanceBudgets(month: string) {
  return apiFetch<FinanceBudgetsPeriod>(`/profit/budgets?month=${encodeURIComponent(month)}`);
}

export function saveFinanceBudgetDraft(input: { month: string; category: string; amount: string; note?: string }) {
  return apiFetch(`/profit/budgets`, { method: 'POST', body: JSON.stringify(input) });
}

export function submitFinanceBudget(id: string) {
  return apiFetch(`/profit/budgets/${encodeURIComponent(id)}/submit`, { method: 'POST' });
}

export function approveFinanceBudget(id: string, reason: string) {
  return apiFetch(`/profit/budgets/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function rejectFinanceBudget(id: string, reason: string) {
  return apiFetch(`/profit/budgets/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
