"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DestructiveConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** The exact text the user must type — mirrors the backend's typed-confirm erasure/danger-zone rule. */
  confirmPhrase: string;
  confirmLabel?: string;
  pending?: boolean;
}

/** Never a plain "Are you sure?" — every irreversible action requires typing the exact phrase back. */
export function DestructiveConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmPhrase,
  confirmLabel = "Delete permanently",
  pending,
}: DestructiveConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = typed === confirmPhrase;

  function handleClose() {
    setTyped("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      preventCasualDismiss
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!matches || pending} onClick={onConfirm}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <Input
        label={
          <>
            Type <span className="font-semibold text-fg">{confirmPhrase}</span> to confirm
          </>
        }
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoFocus
      />
    </Dialog>
  );
}
