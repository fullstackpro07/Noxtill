"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LiveDebtor } from "@/lib/credit-api";
import { recordPayment } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "card" | "online";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "online", label: "Online", icon: Wallet },
];

export function RecordPaymentDialog({
  debtor,
  currency,
  onClose,
}: {
  debtor: LiveDebtor | null;
  currency: string;
  onClose: () => void;
}) {
  if (!debtor) return null;

  // Keyed on the debtor so switching targets remounts fresh amount state instead of reconciling stale input via an effect.
  return <RecordPaymentDialogBody key={debtor.customerId} debtor={debtor} currency={currency} onClose={onClose} />;
}

function RecordPaymentDialogBody({
  debtor,
  currency,
  onClose,
}: {
  debtor: LiveDebtor;
  currency: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const queryClient = useQueryClient();

  const parsed = Number(amount);
  const validAmount = amount.trim() !== "" && !Number.isNaN(parsed) && parsed > 0;
  const newBalance = validAmount ? Math.max(0, debtor.balance - parsed) : debtor.balance;

  const mutation = useMutation({
    mutationFn: () => recordPayment({ customerId: debtor.customerId, amount: parsed, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["ledger", debtor.customerId] });
      toast.success(`Payment of ${formatCurrency(parsed, currency)} recorded for ${debtor.name}.`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record this payment — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record payment — ${debtor.name}`}
      description={`Current balance: ${formatCurrency(debtor.balance, currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!validAmount || mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Amount received"
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          leadingSlot={<span className="text-sm">$</span>}
        />
        <div className="grid grid-cols-3 gap-1.5">
          {PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMethod(key)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-2.5 text-xs font-medium transition-colors",
                method === key ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted hover:bg-surface-2",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
          <span className="text-fg-muted">New balance</span>
          <span className={newBalance === 0 ? "font-semibold text-whatsapp" : "font-semibold text-fg"}>
            {formatCurrency(newBalance, currency)}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
