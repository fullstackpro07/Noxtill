"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LiveInventoryItem } from "@/lib/inventory-api";
import { recordPurchase } from "@/lib/inventory-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function PurchaseDialog({ item, onClose }: { item: LiveInventoryItem | null; onClose: () => void }) {
  if (!item) return null;
  return <PurchaseDialogBody key={item.id} item={item} onClose={onClose} />;
}

function PurchaseDialogBody({ item, onClose }: { item: LiveInventoryItem; onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState(String(item.costPrice));
  const [supplier, setSupplier] = useState("");
  const queryClient = useQueryClient();

  const validQty = qty.trim() !== "" && Number(qty) > 0;
  const validCost = unitCost.trim() === "" || Number(unitCost) >= 0;

  const mutation = useMutation({
    mutationFn: () =>
      recordPurchase({
        productId: item.id,
        qty: Number(qty),
        unitCost: unitCost.trim() === "" ? 0 : Number(unitCost),
        supplier: supplier.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements", item.id] });
      toast.success(`Received ${qty} units of ${item.name}.`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record this purchase — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record purchase — ${item.name}`}
      description="Adds to stock on hand and refreshes the product's cost price."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!validQty || !validCost || mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record purchase"}
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
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          leadingSlot={<span className="text-sm">$</span>}
        />
        <Input label="Supplier (optional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </div>
    </Dialog>
  );
}
