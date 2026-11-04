import { apiFetch } from "@/lib/api-client";

interface RawExpense {
  id: string;
  description: string;
  category: string;
  amount: string;
  recurring: boolean;
  incurredOn: string;
  receiptKey?: string | null;
  receiptUrl?: string | null;
}

export interface LiveExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  recurring: boolean;
  incurredOn: string;
  receiptKey: string | null;
  receiptUrl: string | null;
}

function toLiveExpense(raw: RawExpense): LiveExpense {
  return {
    id: raw.id,
    description: raw.description,
    category: raw.category,
    amount: Number(raw.amount),
    recurring: raw.recurring,
    incurredOn: raw.incurredOn,
    receiptKey: raw.receiptKey ?? null,
    receiptUrl: raw.receiptUrl ?? null,
  };
}

/** GET /expenses?month=YYYY-MM — omit month for all-time. */
export function fetchExpenses(month?: string): Promise<LiveExpense[]> {
  const query = month ? `?month=${month}` : "";
  return apiFetch<RawExpense[]>(`/expenses${query}`).then((rows) => rows.map(toLiveExpense));
}

export interface ExpenseDuplicateCandidates {
  month: string;
  groups: string[][];
}

/** GET /expenses/duplicate-candidates?month=YYYY-MM — tenant-scoped IDs only; expense details stay in the normal Expenses query. */
export function fetchExpenseDuplicateCandidates(month: string): Promise<ExpenseDuplicateCandidates> {
  return apiFetch<ExpenseDuplicateCandidates>(`/expenses/duplicate-candidates?month=${encodeURIComponent(month)}`);
}

export interface CreateExpenseInput {
  description: string;
  category: string;
  amount: number;
  recurring?: boolean;
  incurredOn: string;
}

export function createExpense(input: CreateExpenseInput): Promise<LiveExpense> {
  return apiFetch<RawExpense>("/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toLiveExpense);
}

export function updateExpense(id: string, input: Partial<CreateExpenseInput>): Promise<LiveExpense> {
  return apiFetch<RawExpense>(`/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then(toLiveExpense);
}

export function deleteExpense(id: string): Promise<void> {
  return apiFetch<void>(`/expenses/${id}`, { method: "DELETE" });
}
