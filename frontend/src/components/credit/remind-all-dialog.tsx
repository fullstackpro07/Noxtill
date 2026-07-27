"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Debtor } from "@/lib/credit";
import { toast } from "@/lib/toast";

export function RemindAllDialog({ open, debtors, onClose }: { open: boolean; debtors: Debtor[]; onClose: () => void }) {
  if (!open) return null;

  const recipients = debtors.filter((d) => !d.optedOutOfReminders);
  const excluded = debtors.length - recipients.length;

  function handleConfirm() {
    toast.success(`Reminder sent to ${recipients.length} customers. Live send wires up in INT-004.`);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Send payment reminder to all?"
      description={`This will message ${recipients.length} customer${recipients.length === 1 ? "" : "s"} with an outstanding balance.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Send to {recipients.length}</Button>
        </>
      }
    >
      {excluded > 0 && (
        <p className="text-xs text-fg-faint">
          {excluded} customer{excluded === 1 ? "" : "s"} excluded — opted out of reminders.
        </p>
      )}
    </Dialog>
  );
}
