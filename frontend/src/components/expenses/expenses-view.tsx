"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Repeat, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ExpenseCategoryDonut } from "./expense-category-donut";
import { AddExpenseDialog } from "./add-expense-drawer";
import { totalsByCategory } from "@/lib/expenses";
import { fetchExpenses } from "@/lib/expenses-api";
import { formatCurrency, formatDate } from "@/lib/format";

/** Current month + 5 prior, as {value: "YYYY-MM", label: "Month YYYY"} — no fixed roster since any month can have expenses. */
function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

export function ExpensesView({ currency }: { currency: string }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [addOpen, setAddOpen] = useState(false);

  const {
    data: expenses = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["expenses", month], queryFn: () => fetchExpenses(month) });

  const totals = totalsByCategory(expenses);
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Expenses</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{formatCurrency(grandTotal, currency)} total this month</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load expenses" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : (
        <>
          {!isPending && expenses.length > 0 && (
            <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
              <ExpenseCategoryDonut totals={totals} currency={currency} />
            </div>
          )}

          {isPending ? (
            <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses this month"
              description="Add rent, utilities, wages, or other costs to track your margins accurately."
              action={{ label: "Add expense", onClick: () => setAddOpen(true) }}
            />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                    <th className="px-4 py-3 text-start">Description</th>
                    <th className="px-4 py-3 text-start">Category</th>
                    <th className="px-4 py-3 text-start">Date</th>
                    <th className="px-4 py-3 text-start">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg">{e.description}</p>
                        {e.recurring && (
                          <Badge tone="neutral" className="mt-1">
                            <Repeat className="h-3 w-3" aria-hidden />
                            Recurring
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{e.category}</td>
                      <td className="px-4 py-3 text-fg-muted">{formatDate(e.incurredOn)}</td>
                      <td className="px-4 py-3 font-medium text-fg">{formatCurrency(e.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mt-4 text-end">
        <Link href="/profit" className="text-sm font-medium text-primary hover:underline">
          View profit & loss →
        </Link>
      </div>

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} month={month} />
    </div>
  );
}
