"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { Role } from "@/lib/nav-items";

type CommissionType = "none" | "percent" | "perService";

export function InviteStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [commissionType, setCommissionType] = useState<CommissionType>("percent");
  const [rate, setRate] = useState("10");

  if (!open) return null;

  const valid = name.trim() !== "" && phone.trim() !== "";

  function handleSend() {
    toast.success(`Invite sent to ${name}. Live invite wires up in INT-009.`);
    setName("");
    setPhone("");
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Invite staff"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!valid}>
            Send invite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
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
      </div>
    </Dialog>
  );
}
