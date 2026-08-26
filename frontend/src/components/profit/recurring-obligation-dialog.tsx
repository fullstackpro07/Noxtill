"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  createRecurringObligation,
  updateRecurringObligation,
  type RecurringObligation,
  type RecurringObligationFrequency,
} from "@/lib/cash-forecast-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const FREQUENCIES: { value: RecurringObligationFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function RecurringObligationDialog({ obligation, onClose }: { obligation?: RecurringObligation; onClose: () => void }) {
  const [name, setName] = useState(obligation?.name ?? "");
  const [amount, setAmount] = useState(obligation ? String(obligation.amount) : "");
  const [frequency, setFrequency] = useState<RecurringObligationFrequency>(obligation?.frequency ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(obligation?.nextDueDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(obligation?.category ?? "");
  const queryClient = useQueryClient();

  const valid = name.trim() !== "" && Number(amount) > 0 && nextDueDate.trim() !== "";

  const mutation = useMutation({
    mutationFn: () => {
      const draft = { name: name.trim(), amount: Number(amount), frequency, nextDueDate, category: category.trim() || undefined };
      return obligation ? updateRecurringObligation(obligation.id, draft) : createRecurringObligation(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-obligations"] });
      queryClient.invalidateQueries({ queryKey: ["cash-forecast"] });
      toast.success(obligation ? "Obligation updated." : "Obligation added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={obligation ? "Edit recurring obligation" : "Add recurring obligation"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Studio rent" />
        <div className="grid grid-cols-2 gap-3.5">
          <Input
            label="Amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            leadingSlot={<span className="text-sm">$</span>}
          />
          <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringObligationFrequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Next due date" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Rent" />
      </div>
    </Dialog>
  );
}
