import { apiFetch } from "@/lib/api-client";

interface RawExpense {
  id: string;
  description: string;
  category: string;
  amount: string;
  recurring: boolean;
  incurredOn: string;
}

export interface LiveExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  recurring: boolean;
  incurredOn: string;
}

function toLiveExpense(raw: RawExpense): LiveExpense {
  return {
    id: raw.id,
    description: raw.description,
    category: raw.category,
    amount: Number(raw.amount),
    recurring: raw.recurring,
    incurredOn: raw.incurredOn,
  };
}

/** GET /expenses?month=YYYY-MM — omit month for all-time. */
export function fetchExpenses(month?: string): Promise<LiveExpense[]> {
  const query = month ? `?month=${month}` : "";
  return apiFetch<RawExpense[]>(`/expenses${query}`).then((rows) => rows.map(toLiveExpense));
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
