"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/shared/error-states";
import { inviteStaff } from "@/lib/staff-api";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

type CommissionType = "none" | "percent" | "perService";
type InvitableRole = "manager" | "staff";

export function InviteStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InvitableRole>("staff");
  const [commissionType, setCommissionType] = useState<CommissionType>("percent");
  const [rate, setRate] = useState("10");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteStaff({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        commissionRule:
          commissionType === "none"
            ? { type: "none" }
            : commissionType === "percent"
              ? { type: "percent", rate: Number(rate) }
              : { type: "perService", amount: Number(rate) },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        toast.success(`${name} is now on the team.`);
        handleClose();
      }
    },
  });

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    setTempPassword(null);
    setCopied(false);
    onClose();
  }

  async function handleCopyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }

  if (!open) return null;

  const valid = name.trim() !== "" && (email.trim() !== "" || phone.trim() !== "");

  if (tempPassword) {
    return (
      <Dialog
        open
        onClose={handleClose}
        title="Staff invited"
        footer={
          <Button onClick={handleClose}>Done</Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            {name} doesn&apos;t have an account yet — share this temporary password with them so they can sign in and set their own.
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
      onClose={handleClose}
      title="Invite staff"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => inviteMutation.mutate()} disabled={!valid || inviteMutation.isPending}>
            {inviteMutation.isPending ? "Sending…" : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {!valid && (email.trim() !== "" || phone.trim() !== "" || name.trim() !== "") && (
          <InlineError message="An email or phone number is required." />
        )}
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
        </Select>

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-fg">Commission</p>
          <div className="grid grid-cols-3 gap-2 rounded-full bg-surface-2 p-1">
            {(["none", "percent", "perService"] as CommissionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCommissionType(type)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  commissionType === type ? "bg-surface shadow-[var(--shadow-sm)] text-fg" : "text-fg-muted",
                )}
              >
                {type === "none" ? "None" : type === "percent" ? "% of sale" : "Per service"}
              </button>
            ))}
          </div>
          {commissionType !== "none" && (
            <Input
              className="mt-3"
              label={commissionType === "percent" ? "Percent per sale" : "Amount per service"}
              type="number"
              min={0}
              step={commissionType === "percent" ? 1 : 0.5}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              leadingSlot={<span className="text-sm">{commissionType === "percent" ? "%" : "$"}</span>}
            />
          )}
        </div>

        {inviteMutation.isError && (
          <InlineError
            message={
              inviteMutation.error instanceof ApiError
                ? inviteMutation.error.message
                : "Couldn't send this invite — please try again."
            }
          />
        )}
      </div>
    </Dialog>
  );
}
