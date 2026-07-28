"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { InventoryItem } from "@/lib/inventory";
import { toast } from "@/lib/toast";

export function PurchaseDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  if (!item) return null;
  return <PurchaseDialogBody key={item.productId} item={item} onClose={onClose} />;
}

function PurchaseDialogBody({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [costPrice, setCostPrice] = useState(String(item.costPrice));

  const validQty = qty.trim() !== "" && Number(qty) > 0;

  function handleConfirm() {
    toast.success(`Received ${qty} units of ${item.name} — cost price updated to $${costPrice}. Live save wires up in INT-005.`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record purchase — ${item.name}`}
      description="Adds to stock on hand and refreshes the product's cost price."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!validQty}>
            Record purchase
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Quantity received" type="number" min={1} autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input
          label="New cost price"
          type="number"
          min={0}
          step="0.01"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          leadingSlot={<span className="text-sm">$</span>}
        />
      </div>
    </Dialog>
  );
}
