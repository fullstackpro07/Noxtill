"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { LiveInventoryItem, WastageReason } from "@/lib/inventory-api";
import { recordWastage } from "@/lib/inventory-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const WASTAGE_REASONS: WastageReason[] = ["Damaged", "Expired", "Other"];

export function WastageDialog({ item, onClose }: { item: LiveInventoryItem | null; onClose: () => void }) {
  if (!item) return null;
  return <WastageDialogBody key={item.id} item={item} onClose={onClose} />;
}

function WastageDialogBody({ item, onClose }: { item: LiveInventoryItem; onClose: () => void }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WastageReason | "">("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const validQty = qty.trim() !== "" && Number(qty) > 0 && Number(qty) <= item.stockQty;
  const canSubmit = validQty && reason !== "";

  const mutation = useMutation({
    mutationFn: () =>
      recordWastage({
        productId: item.id,
        qty: Number(qty),
        reason: reason as WastageReason,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements", item.id] });
      toast.success(`${qty} units of ${item.name} written off (${reason}).`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't record this wastage — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record wastage — ${item.name}`}
      description={`${item.stockQty} currently in stock. A reason is required.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Writing off…" : "Write off"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Quantity"
          type="number"
          min={1}
          max={item.stockQty}
          autoFocus
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          hint={validQty || qty.trim() === "" ? undefined : `Can't exceed ${item.stockQty} on hand.`}
        />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as WastageReason)}>
          <option value="">Select a reason…</option>
          {WASTAGE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
