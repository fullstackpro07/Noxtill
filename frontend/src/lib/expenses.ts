export const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Supplies", "Wages", "Marketing"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  recurring: boolean;
}

/** Category → chart series slot, fixed order per the dataviz categorical palette (never reassigned by filtering). */
export const CATEGORY_CHART_SLOT: Record<ExpenseCategory, string> = {
  Rent: "var(--chart-1)",
  Utilities: "var(--chart-2)",
  Supplies: "var(--chart-3)",
  Wages: "var(--chart-4)",
  Marketing: "var(--chart-5)",
};

/** Mock month of expenses — recurring flag drives the monthly-clone job (BE-035); live wiring is INT-005. */
export const EXPENSES: Expense[] = [
  { id: "x1", description: "Studio rent", category: "Rent", amount: 2400, date: "2026-07-01", recurring: true },
  { id: "x2", description: "Electricity", category: "Utilities", amount: 180, date: "2026-07-03", recurring: true },
  { id: "x3", description: "Water", category: "Utilities", amount: 60, date: "2026-07-03", recurring: true },
  { id: "x4", description: "Towel & linen service", category: "Supplies", amount: 140, date: "2026-07-05", recurring: true },
  { id: "x5", description: "Retail restock — BeautyCo", category: "Supplies", amount: 420, date: "2026-07-08", recurring: false },
  { id: "x6", description: "Payroll — front desk", category: "Wages", amount: 1850, date: "2026-07-15", recurring: true },
  { id: "x7", description: "Payroll — stylists", category: "Wages", amount: 3200, date: "2026-07-15", recurring: true },
  { id: "x8", description: "Instagram ads", category: "Marketing", amount: 220, date: "2026-07-18", recurring: false },
  { id: "x9", description: "Signage repair", category: "Supplies", amount: 95, date: "2026-07-21", recurring: false },
];

export function totalsByCategory(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  return EXPENSE_CATEGORIES.map((category) => ({
    category,
    total: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.total > 0);
}
