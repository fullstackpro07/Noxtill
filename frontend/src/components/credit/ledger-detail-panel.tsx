"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Download, HandCoins, CalendarClock, Link2, Ban, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { InstallmentPlanDialog } from "./installment-plan-dialog";
import { ShareLinkDialog } from "./share-link-dialog";
import { WriteOffDialog } from "./write-off-dialog";
import { fetchLedger, fetchInstallmentPlans, generateStatement, sendStatement, type LiveDebtor } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const ENTRY_LABEL: Record<"credit" | "payment" | "write_off", string> = {
  credit: "Charge",
  payment: "Payment received",
  write_off: "Written off",
};

function riskSignal(daysOutstanding: number, recentNetChange: number): { label: string; tone: "danger" | "warning" | "success" } {
  if (daysOutstanding >= 60 || recentNetChange > 0) return { label: "High risk", tone: "danger" };
  if (daysOutstanding >= 30) return { label: "Watch", tone: "warning" };
  return { label: "Low risk", tone: "success" };
}

export function LedgerDetailPanel({ customerId, currency }: { customerId: string; currency: string }) {
  const session = useSession();
  const [paying, setPaying] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const { data: ledger, isPending, isError, refetch } = useQuery({ queryKey: ["ledger", customerId], queryFn: () => fetchLedger(customerId) });
  const { data: plans } = useQuery({ queryKey: ["installment-plans", customerId], queryFn: () => fetchInstallmentPlans(customerId) });

  const downloadMutation = useMutation({
    mutationFn: () => generateStatement(customerId),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this statement."),
  });
  const sendMutation = useMutation({
    mutationFn: () => sendStatement(customerId),
    onSuccess: () => toast.success("Statement sent."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this statement."),
  });

  const now = new Date().getTime();
  const daysOutstanding = (() => {
    if (!ledger || ledger.entries.length === 0) return 0;
    const last = ledger.entries[ledger.entries.length - 1];
    return Math.floor((now - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24));
  })();

  const recentNetChange = (() => {
    if (!ledger) return 0;
    const since = now - 30 * 24 * 60 * 60 * 1000;
    return ledger.entries
      .filter((e) => new Date(e.date).getTime() >= since)
      .reduce((sum, e) => sum + (e.kind === "credit" ? e.amount : -e.amount), 0);
  })();

  if (isError) return <ErrorBanner title="Couldn't load this customer's ledger" onRetry={() => refetch()} />;
  if (isPending || !ledger) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  const risk = riskSignal(daysOutstanding, recentNetChange);
  const debtor: LiveDebtor = {
    customerId: ledger.customerId,
    name: ledger.name,
    phone: ledger.phone,
    balance: ledger.balance,
    daysOutstanding,
    optedOutOfReminders: false,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-fg">{ledger.name}</h2>
            <Badge tone={risk.tone}>{risk.label}</Badge>
          </div>
          <p className="text-sm text-fg-muted">{ledger.phone}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Share link
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)} disabled={ledger.balance <= 0}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Instalment plan
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            Send statement
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            PDF
          </Button>
          <Button size="sm" onClick={() => setPaying(true)}>
            <HandCoins className="h-3.5 w-3.5" aria-hidden />
            Record payment
          </Button>
          {session.user.role === "owner" && ledger.balance > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setWriteOffOpen(true)}>
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Write off
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Current balance</p>
            <p className="font-display text-2xl font-bold text-fg">{formatCurrency(ledger.balance, currency)}</p>
          </div>
        </CardContent>
      </Card>

      {ledger.entries.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-fg">Balance over time</p>
            <BalanceOverTimeChart entries={ledger.entries} />
          </CardContent>
        </Card>
      )}

      {plans && plans.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-fg">Instalment plans</p>
            <div className="flex flex-col gap-2">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">{formatCurrency(Number(plan.totalAmount), currency)}</span>
                    <Badge tone={plan.status === "completed" ? "success" : plan.status === "cancelled" ? "neutral" : "primary"}>{plan.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {plan.installments.map((line) => (
                      <span key={line.id} className={`rounded-full px-2 py-0.5 text-xs ${line.status === "paid" ? "bg-whatsapp/12 text-whatsapp" : "bg-surface text-fg-muted"}`}>
                        #{line.seq} {formatCurrency(Number(line.amount), currency)} · {formatDate(line.dueDate)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-fg-faint">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Entry</th>
                  <th className="px-3 py-2 text-end">Amount</th>
                  <th className="px-3 py-2 text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-fg-muted">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2 text-fg">
                      {ENTRY_LABEL[entry.kind]}
                      {entry.note ? ` — ${entry.note}` : ""}
                    </td>
                    <td className={`px-3 py-2 text-end tabular-nums ${entry.kind === "credit" ? "text-fg" : "text-whatsapp"}`}>
                      {entry.kind === "credit" ? "+" : "−"}
                      {formatCurrency(entry.amount, currency)}
                    </td>
                    <td className="px-3 py-2 text-end font-medium tabular-nums text-fg">{formatCurrency(entry.runningBalance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {paying && <RecordPaymentDialog debtor={debtor} currency={currency} onClose={() => setPaying(false)} />}
      {planOpen && <InstallmentPlanDialog customerId={customerId} customerName={ledger.name} balance={ledger.balance} currency={currency} onClose={() => setPlanOpen(false)} />}
      {shareOpen && <ShareLinkDialog customerId={customerId} customerName={ledger.name} onClose={() => setShareOpen(false)} />}
      {writeOffOpen && (
        <WriteOffDialog customerId={customerId} customerName={ledger.name} balance={ledger.balance} currency={currency} onClose={() => setWriteOffOpen(false)} />
      )}
    </div>
  );
}

function BalanceOverTimeChart({ entries }: { entries: { date: string; runningBalance: number }[] }) {
  const width = 560;
  const height = 130;
  const max = Math.max(...entries.map((e) => e.runningBalance), 1);
  const points = entries.map((e, i) => ({ x: (i / (entries.length - 1)) * width, y: height - (e.runningBalance / max) * height }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Balance over time">
        <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{formatDate(entries[0].date)}</span>
        <span>{formatDate(entries[entries.length - 1].date)}</span>
      </div>
    </div>
  );
}
