"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExpenseCategoryDonut } from "./expense-category-donut";
import { AddExpenseDialog } from "./add-expense-drawer";
import { EXPENSES, totalsByCategory } from "@/lib/expenses";
import { formatCurrency, formatDate } from "@/lib/format";

const MONTHS = ["July 2026", "June 2026", "May 2026"];

export function ExpensesView({ currency }: { currency: string }) {
  const [month, setMonth] = useState(MONTHS[0]);
  const [addOpen, setAddOpen] = useState(false);

  const totals = totalsByCategory(EXPENSES);
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Expenses</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{formatCurrency(grandTotal, currency)} total this month</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-36">
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <ExpenseCategoryDonut totals={totals} currency={currency} />
      </div>

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
            {EXPENSES.map((e) => (
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
                <td className="px-4 py-3 text-fg-muted">{formatDate(e.date)}</td>
                <td className="px-4 py-3 font-medium text-fg">{formatCurrency(e.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-end">
        <Link href="/profit" className="text-sm font-medium text-primary hover:underline">
          View profit & loss →
        </Link>
      </div>

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
