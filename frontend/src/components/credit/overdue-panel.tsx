"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Phone, Bell, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { WriteOffDialog } from "./write-off-dialog";
import { fetchOverdueAgeing, bulkRemindDebtors, type CreditReminderTone, type LiveDebtor } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  thirtyPlus: "30+ days",
  sixtyPlus: "60+ days",
  ninetyPlus: "90+ days",
};

export function OverduePanel({ currency }: { currency: string }) {
  const session = useSession();
  const [tone, setTone] = useState<CreditReminderTone>("firm");
  const [writingOff, setWritingOff] = useState<LiveDebtor | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["credit-overdue"],
    queryFn: fetchOverdueAgeing,
  });

  const remindAtRiskMutation = useMutation({
    mutationFn: () => bulkRemindDebtors((data?.atRisk.debtors ?? []).map((d) => d.customerId), tone),
    onSuccess: (result) => toast.success(`Sent ${result.sent} reminder(s) at "${tone}" tone.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  if (isError) return <ErrorBanner title="Couldn't load overdue ageing" onRetry={() => refetch()} />;
  if (isPending || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...data.buckets.map((b) => b.total), 1);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.buckets.map((b) => (
          <Card key={b.key}>
            <CardContent className="p-4">
              <p className="text-xs text-fg-muted">{BUCKET_LABEL[b.key]}</p>
              <p className="font-display text-xl font-bold text-fg">{formatCurrency(b.total, currency)}</p>
              <p className="text-xs text-fg-faint">{b.count} customer(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Ageing waterfall</p>
          <div className="flex items-end gap-3" style={{ height: 140 }}>
            {data.buckets.map((b) => (
              <div key={b.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${Math.max((b.total / max) * 100, 2)}%`, background: "var(--chart-1)", opacity: 0.85 }}
                />
                <span className="text-xs text-fg-muted">{BUCKET_LABEL[b.key]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3.5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">At-risk debtors</p>
              <p className="text-xs text-fg-muted">90+ days overdue with no repayment plan in place</p>
            </div>
            <Badge tone="danger">
              {data.atRisk.count} · {formatCurrency(data.atRisk.total, currency)}
            </Badge>
          </div>

          {data.atRisk.debtors.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No at-risk debtors" description="90+ day debtors without a repayment plan will show up here." />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <Select label="Escalation tone" value={tone} onChange={(e) => setTone(e.target.value as CreditReminderTone)} className="w-40">
                  <option value="gentle">Gentle</option>
                  <option value="firm">Firm</option>
                  <option value="final">Final notice</option>
                </Select>
                <Button variant="outline" size="sm" onClick={() => remindAtRiskMutation.mutate()} disabled={remindAtRiskMutation.isPending}>
                  <Bell className="h-3.5 w-3.5" aria-hidden />
                  Remind all at-risk
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {data.atRisk.debtors.map((d) => (
                  <div key={d.customerId} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{d.name}</p>
                      <p className="text-xs text-fg-muted">
                        {formatCurrency(d.balance, currency)} · {d.daysOutstanding}d outstanding
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a
                        href={`tel:${d.phone}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface hover:text-fg"
                        aria-label={`Call ${d.name}`}
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                      </a>
                      {session.user.role === "owner" && (
                        <Button variant="destructive" size="sm" onClick={() => setWritingOff(d)}>
                          <Ban className="h-3.5 w-3.5" aria-hidden />
                          Write off
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {writingOff && (
        <WriteOffDialog
          customerId={writingOff.customerId}
          customerName={writingOff.name}
          balance={writingOff.balance}
          currency={currency}
          onClose={() => setWritingOff(null)}
        />
      )}
    </div>
  );
}
