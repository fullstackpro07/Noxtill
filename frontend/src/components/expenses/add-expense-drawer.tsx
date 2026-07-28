"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";
import { toast } from "@/lib/toast";

export function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);

  if (!open) return null;

  const valid = description.trim() !== "" && Number(amount) > 0;

  function handleSave() {
    toast.success(`"${description}" added${recurring ? " as a recurring expense" : ""}. Live save wires up in INT-005.`);
    setDescription("");
    setAmount("");
    setRecurring(false);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add expense"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid}>
            Add expense
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
