"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/shared/error-states";
import { InlineError } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { InviteStaffDialog } from "./invite-staff-dialog";
import { fetchStaffList, updateStaffMember, type LiveStaffMember } from "@/lib/staff-api";
import { commissionRuleLabel } from "@/lib/staff";
import type { CommissionRule } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import type { Role } from "@/lib/nav-items";

const ROLE_TONE: Record<Role, "primary" | "success" | "neutral"> = {
  owner: "primary",
  manager: "success",
  staff: "neutral",
};

const AVATAR_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function TeamList({ role }: { role: Role }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<LiveStaffMember | null>(null);
  const { data: staff = [], isPending, isError, refetch } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });

  return (
    <div>
      {role === "owner" && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Invite staff
          </Button>
        </div>
      )}

      {isError ? (
        <ErrorBanner title="Couldn't load the team" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Name</th>
                <th className="px-4 py-3 text-start">Role</th>
                <th className="px-4 py-3 text-start">Phone</th>
                <th className="px-4 py-3 text-start">Commission</th>
                <th className="px-4 py-3 text-start">Hourly rate</th>
              </tr>
            </thead>
            <tbody>
              {isPending
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td colSpan={5} className="px-4 py-3">
                        <SkeletonRow />
                      </td>
                    </tr>
                  ))
                : staff.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => role === "owner" && s.role !== "owner" && setEditing(s)}
                      className={cn(
                        "border-b border-border last:border-0",
                        role === "owner" && s.role !== "owner" && "cursor-pointer hover:bg-surface-2/50",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
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
                      <td className="px-4 py-3 text-fg-muted">{s.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-fg-muted">{commissionRuleLabel(s.commissionRule)}</td>
                      <td className="px-4 py-3 text-fg-muted">{s.hourlyRate != null ? `$${s.hourlyRate}/hr` : "—"}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteStaffDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {editing && <EditStaffPayDialog staff={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type CommissionType = "none" | "percent" | "perService";

/** Staff depth fix (UPD-INT-011): the first UI wiring for `updateStaffMember` — previously only
 * settable at invite time, with no way to adjust an existing staff member's commission or hourly
 * rate afterward. */
function EditStaffPayDialog({ staff, onClose }: { staff: LiveStaffMember; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initialCommissionType: CommissionType = staff.commissionRule.type;
  const [commissionType, setCommissionType] = useState<CommissionType>(initialCommissionType);
  const [rate, setRate] = useState(
    String(staff.commissionRule.type === "percent" ? staff.commissionRule.rate : staff.commissionRule.type === "perService" ? staff.commissionRule.amount : 10),
  );
  const [hourlyRate, setHourlyRate] = useState(staff.hourlyRate != null ? String(staff.hourlyRate) : "");

  const mutation = useMutation({
    mutationFn: () =>
      updateStaffMember(staff.id, {
        role: staff.role === "owner" ? "manager" : staff.role,
        commissionRule: (commissionType === "none"
          ? { type: "none" }
          : commissionType === "percent"
            ? { type: "percent", rate: Number(rate) }
            : { type: "perService", amount: Number(rate) }) as CommissionRule,
        hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success(`${staff.name}'s pay setup updated.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these changes — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit pay — ${staff.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
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

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-fg">Hourly wage (optional)</p>
          <Input
            label="Hourly rate"
            type="number"
            min={0}
            step={0.5}
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            leadingSlot={<span className="text-sm">$</span>}
            hint="Leave blank for purely-commission pay. When set, real overtime hours are paid at this rate (or the business's overtime multiplier) on top of any commission."
          />
        </div>

        {mutation.isError && (
          <InlineError message={mutation.error instanceof ApiError ? mutation.error.message : "Couldn't save these changes — please try again."} />
        )}
      </div>
    </Dialog>
  );
}
