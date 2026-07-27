"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Debtor } from "@/lib/credit";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function StatementDialog({
  debtor,
  currency,
  onClose,
}: {
  debtor: Debtor | null;
  currency: string;
  onClose: () => void;
}) {
  if (!debtor) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Statement — ${debtor.name}`}
      description={debtor.phone}
      footer={
        <Button onClick={() => toast.info(`Statement PDF for ${debtor.name} shared via WhatsApp. Live send wires up in INT-004.`)}>
          Share via WhatsApp
        </Button>
      }
    >
      <div className="rounded-[var(--radius-noxtill)] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-fg-faint">
              <th className="px-3 py-2 text-start">Date</th>
              <th className="px-3 py-2 text-start">Description</th>
              <th className="px-3 py-2 text-end">Amount</th>
              <th className="px-3 py-2 text-end">Balance</th>
            </tr>
          </thead>
          <tbody>
            {debtor.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 whitespace-nowrap text-fg-muted">{formatDate(entry.date)}</td>
                <td className="px-3 py-2 text-fg">{entry.description}</td>
                <td className={`px-3 py-2 text-end tabular-nums ${entry.amount < 0 ? "text-whatsapp" : "text-fg"}`}>
                  {entry.amount < 0 ? "−" : "+"}
                  {formatCurrency(Math.abs(entry.amount), currency)}
                </td>
                <td className="px-3 py-2 text-end font-medium tabular-nums text-fg">{formatCurrency(entry.runningBalance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
        <span className="text-fg-muted">Current balance</span>
        <span className="font-display font-bold text-fg">{formatCurrency(debtor.balance, currency)}</span>
      </div>
    </Dialog>
  );
}
