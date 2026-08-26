"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, AlertTriangle, CalendarClock, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow, Skeleton } from "@/components/shared/skeleton";
import { CashFlowChart } from "./cash-flow-chart";
import { RecurringObligationDialog } from "./recurring-obligation-dialog";
import {
  fetchCashForecast,
  fetchRecurringObligations,
  updateRecurringObligation,
  deleteRecurringObligation,
  type RecurringObligation,
} from "@/lib/cash-forecast-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" | "good" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "danger" ? "text-destructive" : tone === "good" ? "text-whatsapp" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function CashFlowView({ currency }: { currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringObligation | null>(null);
  const [deleting, setDeleting] = useState<RecurringObligation | null>(null);
  const queryClient = useQueryClient();

  const { data: forecast, isPending, isError, refetch } = useQuery({
    queryKey: ["cash-forecast", 30],
    queryFn: () => fetchCashForecast(30),
  });

  const { data: obligations = [], isPending: obligationsPending } = useQuery({
    queryKey: ["recurring-obligations"],
    queryFn: fetchRecurringObligations,
  });

  const toggleMutation = useMutation({
    mutationFn: (o: RecurringObligation) => updateRecurringObligation(o.id, { active: !o.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-obligations"] });
      queryClient.invalidateQueries({ queryKey: ["cash-forecast"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringObligation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-obligations"] });
      queryClient.invalidateQueries({ queryKey: ["cash-forecast"] });
      toast.success("Obligation removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this — please try again."),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load the cash flow forecast" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  const shortfallDate = forecast?.shortfallDates[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending || !forecast ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Avg daily revenue" value={formatCurrency(forecast.dailyAvgRevenue, currency)} />
            <StatCard label="Avg daily expenses" value={formatCurrency(forecast.dailyAvgExpense, currency)} />
            <StatCard
              label="Projected shortfall"
              value={shortfallDate ? formatDate(shortfallDate) : "None in 30 days"}
              tone={shortfallDate ? "danger" : "good"}
            />
          </>
        )}
      </div>

      {shortfallDate && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/6 p-4 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          At current pace, your projected cumulative cash flow turns negative around <span className="font-medium">{formatDate(shortfallDate)}</span>.
          This is a relative projection from your trailing-30-day averages plus scheduled obligations — not a real bank balance.
        </div>
      )}

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="mb-4 text-sm font-medium text-fg">30-day cash flow projection</p>
        {isPending || !forecast ? <Skeleton className="h-44 w-full" /> : <CashFlowChart days={forecast.projection} currency={currency} />}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <p className="text-sm font-medium text-fg">Recurring obligations</p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add obligation
          </Button>
        </div>

        {obligationsPending ? (
          <div>
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : obligations.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No recurring obligations"
            description="Rent, loan payments, or subscriptions you pay on a schedule — added here so the forecast accounts for them."
            action={{ label: "Add obligation", onClick: () => setCreating(true) }}
          />
        ) : (
          <div className="divide-y divide-border">
            {obligations.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${o.active ? "text-fg" : "text-fg-faint line-through"}`}>{o.name}</p>
                    {!o.active && <Badge tone="neutral">Paused</Badge>}
                  </div>
                  <p className="text-xs text-fg-muted">
                    {formatCurrency(o.amount, currency)} · {FREQUENCY_LABELS[o.frequency]} · next {formatDate(o.nextDueDate)}
                    {o.category ? ` · ${o.category}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate(o)} aria-label={o.active ? "Pause" : "Resume"}>
                    <Power className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(o)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(o)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && <RecurringObligationDialog onClose={() => setCreating(false)} />}
      {editing && <RecurringObligationDialog obligation={editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.name}"?` : "Remove obligation"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </div>
  );
}
