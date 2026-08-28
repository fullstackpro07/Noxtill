"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createBranch } from "@/lib/branches-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function CreateBranchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CreateBranchDialogBody onClose={onClose} />;
}

function CreateBranchDialogBody({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const valid = name.trim() !== "" && ownerName.trim() !== "" && (ownerEmail.trim() !== "" || ownerPhone.trim() !== "");

  const mutation = useMutation({
    mutationFn: () =>
      createBranch({
        name: name.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim() || undefined,
        ownerPhone: ownerPhone.trim() || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["rollup-dashboard"] });
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        toast.success(`"${result.business.name}" created.`);
        onClose();
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this branch — please try again."),
  });

  async function handleCopyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }

  if (tempPassword) {
    return (
      <Dialog open onClose={onClose} title="Branch created" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            {ownerName} doesn&apos;t have an account yet — share this temporary password with them so they can sign in and set their own.
          </p>
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-3.5 py-2.5">
            <code className="text-sm text-fg">{tempPassword}</code>
            <button type="button" onClick={handleCopyPassword} className="text-fg-muted hover:text-fg">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add branch"
      description="Creates a real new branch with its own owner login."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create branch"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Branch name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Downtown" />
        <Input label="Owner name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <Input label="Owner email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
        <Input label="Owner phone" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} hint="Provide an email or a phone number." />
      </div>
    </Dialog>
  );
}
