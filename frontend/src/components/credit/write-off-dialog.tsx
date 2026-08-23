"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { writeOffCredit } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";

const CONFIRM_PHRASE = "WRITE OFF";

export function WriteOffDialog({
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
  const [amount, setAmount] = useState(String(balance));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const queryClient = useQueryClient();

  const parsed = Number(amount);
  const validAmount = amount.trim() !== "" && !Number.isNaN(parsed) && parsed > 0 && parsed <= balance;
  const validConfirm = confirm === CONFIRM_PHRASE;

  const mutation = useMutation({
    mutationFn: () => writeOffCredit(customerId, { amount: parsed, reason, confirm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["ledger", customerId] });
      queryClient.invalidateQueries({ queryKey: ["credit-overdue"] });
      toast.success(`Wrote off ${formatCurrency(parsed, currency)} for ${customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't write off this balance."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Write off — ${customerName}`}
      description={`This is irreversible. Current balance: ${formatCurrency(balance, currency)}.`}
      preventCasualDismiss
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!validAmount || !reason.trim() || !validConfirm || mutation.isPending}>
            {mutation.isPending ? "Writing off…" : "Write off"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Amount to write off" type="number" min={0} max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer went out of business" />
        <Input
          label={`Type "${CONFIRM_PHRASE}" to confirm`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={CONFIRM_PHRASE}
        />
      </div>
    </Dialog>
  );
}
