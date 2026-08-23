"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Bell, Check, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchInstallments,
  payInstallment,
  rescheduleInstallment,
  bulkRemindDebtors,
  fetchCollectedToday,
  type DueInstallment,
} from "@/lib/credit-api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekEndIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function DueTodayPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [rescheduling, setRescheduling] = useState<DueInstallment | null>(null);

  const { data: installments, isPending, isError, refetch } = useQuery({
    queryKey: ["installments", "all-pending"],
    queryFn: () => fetchInstallments(),
  });
  const { data: collectedToday } = useQuery({ queryKey: ["collected-today"], queryFn: fetchCollectedToday });

  const today = todayIso();
  const weekEnd = weekEndIso();

  const { dueToday, dueThisWeek, overdue } = useMemo(() => {
    const rows = installments ?? [];
    return {
      dueToday: rows.filter((i) => i.dueDate.slice(0, 10) === today),
      dueThisWeek: rows.filter((i) => i.dueDate.slice(0, 10) > today && i.dueDate.slice(0, 10) <= weekEnd),
      overdue: rows.filter((i) => i.dueDate.slice(0, 10) < today),
    };
  }, [installments, today, weekEnd]);

  const dueOrOverdue = [...overdue, ...dueToday];

  const payMutation = useMutation({
    mutationFn: (id: string) => payInstallment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      queryClient.invalidateQueries({ queryKey: ["collected-today"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Instalment marked paid.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't mark this instalment paid."),
  });

  const remindAllDueMutation = useMutation({
    mutationFn: () => bulkRemindDebtors([...new Set(dueOrOverdue.map((i) => i.customerId))]),
    onSuccess: (result) => toast.success(`Sent ${result.sent} reminder(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Due today</p>
            <p className="font-display text-xl font-bold text-fg">{dueToday.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Due this week</p>
            <p className="font-display text-xl font-bold text-fg">{dueThisWeek.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Overdue</p>
            <p className="font-display text-xl font-bold text-destructive">{overdue.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Collected today</p>
            <p className="font-display text-xl font-bold text-whatsapp">
              {collectedToday != null ? formatCurrency(collectedToday, currency) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => remindAllDueMutation.mutate()} disabled={dueOrOverdue.length === 0 || remindAllDueMutation.isPending}>
          <Bell className="h-3.5 w-3.5" aria-hidden />
          Remind all due
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load instalments" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {dueOrOverdue.length === 0 && !isPending && (
        <Card>
          <CardContent>
            <EmptyState icon={CalendarClock} title="Nothing due" description="Instalments due today or overdue show up here." />
          </CardContent>
        </Card>
      )}
      {dueOrOverdue.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {dueOrOverdue.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{i.customerName}</p>
                  <p className="text-xs text-fg-muted">
                    Instalment {i.seq} · {formatDate(i.dueDate)} · {formatCurrency(i.amount, currency)}
                    {i.dueDate.slice(0, 10) < today && <span className="ms-1.5 font-medium text-destructive">Overdue</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setRescheduling(i)}>
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Reschedule
                  </Button>
                  <Button size="sm" onClick={() => payMutation.mutate(i.id)} disabled={payMutation.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Mark paid
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rescheduling && <RescheduleDialog installment={rescheduling} onClose={() => setRescheduling(null)} />}
    </div>
  );
}

function RescheduleDialog({ installment, onClose }: { installment: DueInstallment; onClose: () => void }) {
  const [dueDate, setDueDate] = useState(installment.dueDate.slice(0, 10));
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => rescheduleInstallment(installment.id, new Date(dueDate).toISOString(), reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success(`${installment.customerName}'s instalment rescheduled.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reschedule this instalment."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reschedule — ${installment.customerName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!dueDate || !reason.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Reschedule"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="New due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer requested more time" />
      </div>
    </Dialog>
  );
}
