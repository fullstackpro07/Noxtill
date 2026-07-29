"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InviteStaffDialog } from "./invite-staff-dialog";
import { STAFF, commissionRuleLabel } from "@/lib/staff";
import type { Role } from "@/lib/nav-items";

const ROLE_TONE: Record<Role, "primary" | "success" | "neutral"> = {
  owner: "primary",
  manager: "success",
  staff: "neutral",
};

export function TeamList() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Invite staff
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Name</th>
              <th className="px-4 py-3 text-start">Role</th>
              <th className="px-4 py-3 text-start">Phone</th>
              <th className="px-4 py-3 text-start">Commission</th>
            </tr>
          </thead>
          <tbody>
            {STAFF.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: s.color }}
                    >
                      {s.name.charAt(0)}
                    </span>
                    <span className="font-medium text-fg">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={ROLE_TONE[s.role]} className="capitalize">
                    {s.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-fg-muted">{s.phone}</td>
                <td className="px-4 py-3 text-fg-muted">{commissionRuleLabel(s.commissionRule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InviteStaffDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
