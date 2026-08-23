"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import type { LiveDebtor } from "@/lib/credit-api";
import { fetchLedger, generateStatement } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const ENTRY_LABEL: Record<"credit" | "payment" | "write_off", string> = {
  credit: "Charge",
  payment: "Payment received",
  write_off: "Written off",
};

export function StatementDialog({
  debtor,
  currency,
  onClose,
}: {
  debtor: LiveDebtor | null;
  currency: string;
  onClose: () => void;
}) {
  if (!debtor) return null;

  return <StatementDialogBody key={debtor.customerId} debtor={debtor} currency={currency} onClose={onClose} />;
}

function StatementDialogBody({ debtor, currency, onClose }: { debtor: LiveDebtor; currency: string; onClose: () => void }) {
  const {
    data: ledger,
    isPending,
    isError,
  } = useQuery({ queryKey: ["ledger", debtor.customerId], queryFn: () => fetchLedger(debtor.customerId) });

  const shareMutation = useMutation({
    mutationFn: () => generateStatement(debtor.customerId),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the statement PDF — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Statement — ${debtor.name}`}
      description={debtor.phone}
      footer={
        <Button onClick={() => shareMutation.mutate()} disabled={shareMutation.isPending}>
          {shareMutation.isPending ? "Preparing…" : "Download / Share PDF"}
        </Button>
      }
    >
      {isError ? (
        <InlineError message="Couldn't load this customer's ledger." />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-[var(--radius-noxtill)] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-fg-faint">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Entry</th>
                  <th className="px-3 py-2 text-end">Amount</th>
                  <th className="px-3 py-2 text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-fg-muted">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2 text-fg">
                      {ENTRY_LABEL[entry.kind]}
                      {entry.note ? ` — ${entry.note}` : ""}
                    </td>
                    <td className={`px-3 py-2 text-end tabular-nums ${entry.kind === "credit" ? "text-fg" : "text-whatsapp"}`}>
                      {entry.kind === "credit" ? "+" : "−"}
                      {formatCurrency(entry.amount, currency)}
                    </td>
                    <td className="px-3 py-2 text-end font-medium tabular-nums text-fg">
                      {formatCurrency(entry.runningBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
            <span className="text-fg-muted">Current balance</span>
            <span className="font-display font-bold text-fg">{formatCurrency(ledger.balance, currency)}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
