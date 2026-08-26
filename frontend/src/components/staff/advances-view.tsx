"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Plus, Pencil, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchAllAdvances, fetchStaffList, createAdvance, updateAdvance, cancelAdvance, type Advance } from "@/lib/staff-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<Advance["status"], "primary" | "success" | "neutral"> = {
  outstanding: "primary",
  deducted: "success",
  cancelled: "neutral",
};

export function AdvancesView({ currency }: { currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Advance | null>(null);
  const [cancelling, setCancelling] = useState<Advance | null>(null);
  const queryClient = useQueryClient();

  const { data: advances = [], isPending, isError, refetch } = useQuery({ queryKey: ["advances"], queryFn: fetchAllAdvances });

  const cancelMutation = useMutation({
    mutationFn: (a: Advance) => cancelAdvance(a.staffUserId, a.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      toast.success("Advance cancelled.");
      setCancelling(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this advance — please try again."),
  });

  const outstandingTotal = advances.filter((a) => a.status === "outstanding").reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface px-4 py-3">
          <span className="text-xs font-medium text-fg-faint">Outstanding total</span>
          <p className="font-display text-lg font-bold text-fg">{formatCurrency(outstandingTotal, currency)}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add advance
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load advances" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : advances.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No advances yet"
          description="Record a cash advance to a staff member — it's automatically deducted from their next commission payout."
          action={{ label: "Add advance", onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Staff</th>
                <th className="px-4 py-3 text-start">Amount</th>
                <th className="px-4 py-3 text-start">Reason</th>
                <th className="px-4 py-3 text-start">Date</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">{a.staffName ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(a.amount, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{a.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[a.status]}>
                      {a.status}
                      {a.deductedInMonth ? ` · ${a.deductedInMonth}` : ""}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === "outstanding" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(a)} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCancelling(a)} aria-label="Cancel">
                          <XCircle className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <AdvanceFormDialog onClose={() => setCreating(false)} />}
      {editing && <AdvanceFormDialog advance={editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={cancelling != null}
        onClose={() => setCancelling(null)}
        title={cancelling ? `Cancel this ${formatCurrency(cancelling.amount, currency)} advance?` : "Cancel advance"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              Back
            </Button>
            <Button variant="destructive" onClick={() => cancelling && cancelMutation.mutate(cancelling)} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling…" : "Cancel advance"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function AdvanceFormDialog({ advance, onClose }: { advance?: Advance; onClose: () => void }) {
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });
  const [staffUserId, setStaffUserId] = useState(advance?.staffUserId ?? "");
  const [amount, setAmount] = useState(advance ? String(advance.amount) : "");
  const [reason, setReason] = useState(advance?.reason ?? "");
  const queryClient = useQueryClient();

  const valid = staffUserId !== "" && Number(amount) > 0;

  const mutation = useMutation({
    mutationFn: () => {
      const draft = { amount: Number(amount), reason: reason.trim() || undefined };
      return advance ? updateAdvance(advance.staffUserId, advance.id, draft) : createAdvance(staffUserId, draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      toast.success(advance ? "Advance updated." : "Advance added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this advance — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={advance ? "Edit advance" : "Add advance"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {advance ? (
          <p className="text-sm text-fg-muted">{advance.staffName}</p>
        ) : (
          <Select label="Staff member" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)}>
            <option value="">Select…</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        <Input label="Amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} leadingSlot={<span className="text-sm">$</span>} />
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Emergency" />
      </div>
    </Dialog>
  );
}
