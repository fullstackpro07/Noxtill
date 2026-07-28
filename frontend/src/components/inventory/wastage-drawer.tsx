"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { WASTAGE_REASONS, type InventoryItem, type WastageReason } from "@/lib/inventory";
import { toast } from "@/lib/toast";

export function WastageDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  if (!item) return null;
  return <WastageDialogBody key={item.productId} item={item} onClose={onClose} />;
}

function WastageDialogBody({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason | "">("");

  const validQty = qty.trim() !== "" && Number(qty) > 0 && Number(qty) <= item.stockOnHand;
  const canSubmit = validQty && reason !== "";

  function handleConfirm() {
    const reasonLabel = WASTAGE_REASONS.find((r) => r.key === reason)?.label ?? reason;
    toast.success(`${qty} units of ${item.name} written off (${reasonLabel}). Live save wires up in INT-005.`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record wastage — ${item.name}`}
      description={`${item.stockOnHand} currently in stock. A reason is required.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            Write off
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Quantity"
          type="number"
          min={1}
          max={item.stockOnHand}
          autoFocus
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          hint={validQty || qty.trim() === "" ? undefined : `Can't exceed ${item.stockOnHand} on hand.`}
        />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as WastageReason)}>
          <option value="">Select a reason…</option>
          {WASTAGE_REASONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
    </Dialog>
  );
}
