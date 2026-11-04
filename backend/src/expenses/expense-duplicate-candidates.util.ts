import { Prisma } from '@prisma/client';

export type ExpenseDuplicateCandidateSource = {
  id: string;
  businessId: string;
  description: string;
  category: string;
  amount: Prisma.Decimal;
  recurring: boolean;
  incurredOn: Date;
};

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Exact-match groups are review candidates only. Matching fields intentionally mirror neither
 * fraud detection nor accounting validation; recurring identical expenses can be legitimate.
 */
export function findPotentialExpenseDuplicateGroups<
  T extends ExpenseDuplicateCandidateSource,
>(expenses: readonly T[]): T[][] {
  const grouped = new Map<string, T[]>();
  for (const expense of expenses) {
    const key = JSON.stringify([
      expense.businessId,
      expense.incurredOn.toISOString().slice(0, 10),
      normalizeText(expense.description),
      normalizeText(expense.category),
      expense.amount.toFixed(2),
      expense.recurring,
    ]);
    const group = grouped.get(key) ?? [];
    group.push(expense);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter((group) => group.length > 1);
}
