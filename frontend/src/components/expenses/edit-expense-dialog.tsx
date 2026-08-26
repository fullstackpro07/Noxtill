"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { updateExpense, type LiveExpense } from "@/lib/expenses-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function EditExpenseDialog({ expense, onClose }: { expense: LiveExpense; onClose: () => void }) {
  const [description, setDescription] = useState(expense.description);
  const [category, setCategory] = useState<string>(expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [incurredOn, setIncurredOn] = useState(expense.incurredOn.slice(0, 10));
  const [recurring, setRecurring] = useState(expense.recurring);
  const queryClient = useQueryClient();

  const knownCategory = (EXPENSE_CATEGORIES as readonly string[]).includes(category);
  const valid = description.trim() !== "" && Number(amount) > 0 && incurredOn.trim() !== "";

  const mutation = useMutation({
    mutationFn: () =>
      updateExpense(expense.id, {
        description: description.trim(),
        category,
        amount: Number(amount),
        recurring,
        incurredOn,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated.");
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this expense — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit expense"
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
      <div className="flex flex-col gap-4">
        <Input label="Description" autoFocus value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category" value={knownCategory ? category : ""} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {!knownCategory && <option value="">{category}</option>}
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
