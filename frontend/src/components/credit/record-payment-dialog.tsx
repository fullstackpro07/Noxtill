"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Debtor } from "@/lib/credit";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

export function RecordPaymentDialog({
  debtor,
  currency,
  onClose,
  onRecorded,
}: {
  debtor: Debtor | null;
  currency: string;
  onClose: () => void;
  onRecorded: (customerId: string, amount: number) => void;
}) {
  if (!debtor) return null;

  // Keyed on the debtor so switching targets remounts fresh amount state instead of reconciling stale input via an effect.
  return (
    <RecordPaymentDialogBody
      key={debtor.customerId}
      debtor={debtor}
      currency={currency}
      onClose={onClose}
      onRecorded={onRecorded}
    />
  );
}

function RecordPaymentDialogBody({
  debtor,
  currency,
  onClose,
  onRecorded,
}: {
  debtor: Debtor;
  currency: string;
  onClose: () => void;
  onRecorded: (customerId: string, amount: number) => void;
}) {
  const [amount, setAmount] = useState("");

  const parsed = Number(amount);
  const validAmount = amount.trim() !== "" && !Number.isNaN(parsed) && parsed > 0;
  const newBalance = validAmount ? Math.max(0, debtor.balance - parsed) : debtor.balance;

  function handleConfirm() {
    onRecorded(debtor.customerId, parsed);
    toast.success(`Payment of ${formatCurrency(parsed, currency)} recorded for ${debtor.name}. Live save wires up in INT-004.`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record payment — ${debtor.name}`}
      description={`Current balance: ${formatCurrency(debtor.balance, currency)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!validAmount}>
            Record payment
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
