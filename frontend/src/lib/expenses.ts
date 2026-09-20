export const EXPENSE_CATEGORIES = ["Rent", "Salaries", "Utilities", "Supplies", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Category → chart color, fixed order/hex (never reassigned by filtering). */
export const CATEGORY_CHART_SLOT: Record<ExpenseCategory, string> = {
  Rent: "#2563EB",
  Salaries: "#12A150",
  Utilities: "#F97316",
  Supplies: "#9333EA",
  Other: "#98A2B3",
};

export function totalsByCategory(
  expenses: { category: string; amount: number }[],
): { category: ExpenseCategory; total: number }[] {
  return EXPENSE_CATEGORIES.map((category) => ({
    category,
    total: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.total > 0);
}
