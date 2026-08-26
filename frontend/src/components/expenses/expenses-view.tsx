"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Repeat, Receipt, Camera, Paperclip, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ExpenseCategoryDonut } from "./expense-category-donut";
import { AddExpenseDialog } from "./add-expense-drawer";
import { EditExpenseDialog } from "./edit-expense-dialog";
import { ScanReceiptDialog } from "./scan-receipt-dialog";
import { totalsByCategory } from "@/lib/expenses";
import { fetchExpenses, deleteExpense, type LiveExpense } from "@/lib/expenses-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

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

/** YYYY-MM of the calendar month immediately before the given one. */
function priorMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ExpensesView({ currency }: { currency: string }) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<LiveExpense | null>(null);
  const [deleting, setDeleting] = useState<LiveExpense | null>(null);
  const queryClient = useQueryClient();

  const {
    data: expenses = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["expenses", month], queryFn: () => fetchExpenses(month) });

  const { data: lastMonthExpenses } = useQuery({
    queryKey: ["expenses", priorMonth(month)],
    queryFn: () => fetchExpenses(priorMonth(month)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this expense — please try again."),
  });

  const totals = totalsByCategory(expenses);
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
  const lastMonthTotal = lastMonthExpenses?.reduce((sum, e) => sum + e.amount, 0) ?? null;
  const vsLastMonth =
    lastMonthTotal != null && lastMonthTotal > 0 ? Math.round(((grandTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

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
          <Button variant="outline" size="sm" onClick={() => setScanOpen(true)}>
            <Camera className="h-4 w-4" aria-hidden />
            Scan receipt
          </Button>
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
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
                <ExpenseCategoryDonut totals={totals} currency={currency} />
              </div>
              <div className="flex flex-col justify-center rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
                <span className="text-xs font-medium text-fg-faint">vs last month</span>
                {vsLastMonth == null ? (
                  <span className="mt-1 text-sm text-fg-muted">Not enough history yet</span>
                ) : (
                  <span
                    className={`mt-1 flex items-center gap-1 font-display text-xl font-bold ${
                      vsLastMonth > 0 ? "text-destructive" : "text-whatsapp"
                    }`}
                  >
                    {vsLastMonth > 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
                    {vsLastMonth > 0 ? "+" : ""}
                    {vsLastMonth}%
                  </span>
                )}
              </div>
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
                    <th className="px-4 py-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg">{e.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {e.recurring && (
                            <Badge tone="neutral">
                              <Repeat className="h-3 w-3" aria-hidden />
                              Recurring
                            </Badge>
                          )}
                          {e.receiptUrl && (
                            <a href={e.receiptUrl} target="_blank" rel="noreferrer">
                              <Badge tone="primary" className="cursor-pointer hover:brightness-95">
                                <Paperclip className="h-3 w-3" aria-hidden />
                                Receipt
                              </Badge>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{e.category}</td>
                      <td className="px-4 py-3 text-fg-muted">{formatDate(e.incurredOn)}</td>
                      <td className="px-4 py-3 font-medium text-fg">{formatCurrency(e.amount, currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(e)} aria-label="Edit expense">
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(e)} aria-label="Delete expense">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
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
      <ScanReceiptDialog open={scanOpen} onClose={() => setScanOpen(false)} />
      {editing && <EditExpenseDialog expense={editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.description}"?` : "Remove expense"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </div>
  );
}
