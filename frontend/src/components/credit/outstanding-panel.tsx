"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Wallet, Bell, HandCoins, FileText, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { StatementDialog } from "./statement-dialog";
import { RemindAllDialog } from "./remind-all-dialog";
import { fetchDebtors, bulkRemindDebtors, bulkGenerateStatements, type LiveDebtor } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

function priorityFor(daysOutstanding: number): { label: string; tone: "danger" | "warning" | "neutral" } {
  if (daysOutstanding >= 90) return { label: "Critical", tone: "danger" };
  if (daysOutstanding >= 30) return { label: "Watch", tone: "warning" };
  return { label: "Recent", tone: "neutral" };
}

export function OutstandingPanel({ currency }: { currency: string }) {
  const [remindAllOpen, setRemindAllOpen] = useState(false);
  const [payingDebtor, setPayingDebtor] = useState<LiveDebtor | null>(null);
  const [statementDebtor, setStatementDebtor] = useState<LiveDebtor | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const {
    data: debtors = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });

  const remindMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkRemindDebtors(customerIds),
    onSuccess: (result) => {
      toast.success(`Sent ${result.sent} reminder(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`);
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  const statementsMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkGenerateStatements(customerIds),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.url).length;
      toast.success(`Generated ${ok} of ${results.length} statement(s).`);
      results.forEach((r) => r.url && window.open(r.url, "_blank", "noopener,noreferrer"));
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate statements."),
  });

  const total = debtors.reduce((sum, d) => sum + d.balance, 0);

  function toggle(customerId: string) {
    setSelected((ids) => (ids.includes(customerId) ? ids.filter((i) => i !== customerId) : [...ids, customerId]));
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="Couldn't load the credit ledger" description="Check your connection and try again." onRetry={() => refetch()} />
      </div>
    );
  }

  if (!isPending && debtors.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={PartyPopper}
          title="Everyone's paid up!"
          description="No outstanding balances right now — great job staying on top of credit."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Outstanding</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{debtors.length} customers with a balance, most urgent first</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => statementsMutation.mutate(selected)} disabled={statementsMutation.isPending}>
                <FileText className="h-4 w-4" aria-hidden />
                Statement ({selected.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => remindMutation.mutate(selected)} disabled={remindMutation.isPending}>
                <Bell className="h-4 w-4" aria-hidden />
                Remind ({selected.length})
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setRemindAllOpen(true)}>
            <Bell className="h-4 w-4" aria-hidden />
            Remind all
          </Button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Total receivable</p>
          <p className="font-display text-2xl font-bold text-fg">{formatCurrency(total, currency)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 text-start">Customer</th>
              <th className="px-4 py-3 text-start">Priority</th>
              <th className="px-4 py-3 text-start">Balance</th>
              <th className="px-4 py-3 text-start">Last activity</th>
              <th className="px-4 py-3 text-start" />
            </tr>
          </thead>
          <tbody>
            {isPending &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <SkeletonRow />
                  </td>
                </tr>
              ))}
            {debtors.map((d) => {
              const priority = priorityFor(d.daysOutstanding);
              return (
                <tr key={d.customerId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.includes(d.customerId)} onChange={() => toggle(d.customerId)} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/credit/${d.customerId}`} className="font-medium text-fg hover:text-primary hover:underline">
                      {d.name}
                    </Link>
                    <p className="text-xs text-fg-faint">{d.phone}</p>
                    {d.optedOutOfReminders && (
                      <Badge tone="neutral" className="mt-1">
                        Opted out of reminders
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={priority.tone}>{priority.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={d.balance > 0 ? "font-semibold text-destructive" : "font-semibold text-whatsapp"}>
                      {formatCurrency(d.balance, currency)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{d.daysOutstanding}d ago</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => remindMutation.mutate([d.customerId])}
                        disabled={d.optedOutOfReminders || remindMutation.isPending}
                        aria-label={`Remind ${d.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Bell className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        onClick={() => setPayingDebtor(d)}
                        aria-label={`Record payment for ${d.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                      >
                        <HandCoins className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        onClick={() => setStatementDebtor(d)}
                        aria-label={`View statement for ${d.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RemindAllDialog open={remindAllOpen} debtors={debtors} onClose={() => setRemindAllOpen(false)} />
      <RecordPaymentDialog debtor={payingDebtor} currency={currency} onClose={() => setPayingDebtor(null)} />
      <StatementDialog debtor={statementDebtor} currency={currency} onClose={() => setStatementDebtor(null)} />
    </div>
  );
}
