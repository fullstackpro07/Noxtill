"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createInstallmentPlan } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

interface Line {
  amount: string;
  dueDate: string;
}

function defaultLines(balance: number): Line[] {
  const today = new Date();
  return Array.from({ length: 3 }, (_, i) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i + 1);
    return { amount: (balance / 3).toFixed(2), dueDate: d.toISOString().slice(0, 10) };
  });
}

export function InstallmentPlanDialog({
  customerId,
  customerName,
  balance,
  currency,
  onClose,
}: {
  customerId: string;
  customerName: string;
  balance: number;
  currency: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>(defaultLines(balance));
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const valid = lines.length > 0 && lines.every((l) => Number(l.amount) > 0 && l.dueDate) && Math.abs(total - balance) < 0.01;

  const mutation = useMutation({
    mutationFn: () =>
      createInstallmentPlan(customerId, {
        totalAmount: total,
        note: note || undefined,
        installments: lines.map((l) => ({ amount: Number(l.amount), dueDate: l.dueDate })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installment-plans", customerId] });
      toast.success(`Instalment plan created for ${customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this plan."),
  });

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Instalment plan — ${customerName}`}
      description={`Current balance: ${formatCurrency(balance, currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create plan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="number" min={0} step="0.01" value={line.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} className="flex-1" placeholder="Amount" />
              <Input type="date" value={line.dueDate} onChange={(e) => updateLine(i, { dueDate: e.target.value })} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove line">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setLines((rows) => [...rows, { amount: "0", dueDate: "" }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add instalment
        </Button>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
          <span className="text-fg-muted">Plan total</span>
          <span className={Math.abs(total - balance) < 0.01 ? "font-semibold text-whatsapp" : "font-semibold text-destructive"}>
            {formatCurrency(total, currency)}
          </span>
        </div>
        {Math.abs(total - balance) >= 0.01 && (
          <p className="text-xs text-fg-faint">Instalments must sum to the current balance ({formatCurrency(balance, currency)}).</p>
        )}
      </div>
    </Dialog>
  );
}
