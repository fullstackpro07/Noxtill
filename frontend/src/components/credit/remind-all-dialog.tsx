"use client";

import { useMutation } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LiveDebtor } from "@/lib/credit-api";
import { remindAllDebtors } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function RemindAllDialog({ open, debtors, onClose }: { open: boolean; debtors: LiveDebtor[]; onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: remindAllDebtors,
    onSuccess: (result) => {
      toast.success(`Reminder sent to ${result.sent} customer${result.sent === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders — please try again.");
    },
  });

  if (!open) return null;

  const recipients = debtors.filter((d) => !d.optedOutOfReminders);
  const excluded = debtors.length - recipients.length;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Send payment reminder to all?"
      description={`This will message ${recipients.length} customer${recipients.length === 1 ? "" : "s"} with an outstanding balance.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : `Send to ${recipients.length}`}
          </Button>
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
