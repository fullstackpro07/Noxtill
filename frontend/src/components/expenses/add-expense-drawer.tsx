"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { createExpense } from "@/lib/expenses-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Defaults the date field to today if `month` is the current month, otherwise the 1st of that month. */
function defaultIncurredOn(month: string): string {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (month === currentMonth) return now.toISOString().slice(0, 10);
  return `${month}-01`;
}

export function AddExpenseDialog({ open, onClose, month }: { open: boolean; onClose: () => void; month: string }) {
  if (!open) return null;
  return <AddExpenseDialogBody key={month} onClose={onClose} month={month} />;
}

function AddExpenseDialogBody({ onClose, month }: { onClose: () => void; month: string }) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(() => defaultIncurredOn(month));
  const [recurring, setRecurring] = useState(false);
  const queryClient = useQueryClient();

  const valid = description.trim() !== "" && Number(amount) > 0 && incurredOn.trim() !== "";

  const mutation = useMutation({
    mutationFn: () =>
      createExpense({
        description: description.trim(),
        category,
        amount: Number(amount),
        recurring,
        incurredOn,
      }),
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`"${expense.description}" added${expense.recurring ? " as a recurring expense" : ""}.`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add this expense — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add expense"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add expense"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Description" autoFocus value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label="Amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            leadingSlot={<span className="text-sm">$</span>}
          />
        </div>
        <Input label="Date incurred" type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
        <label className="flex items-center gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-primary"
          />
          Repeats monthly
        </label>
      </div>
    </Dialog>
  );
}
