"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Eye, Send, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  fetchNightlyCloseHistory,
  previewNightlyClose,
  sendNightlyCloseTest,
  updateNightlyCloseSettings,
  type NightlyClosePreview,
} from "@/lib/nightly-close-api";

export function NightlyCloseView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: history, isPending, isError, refetch } = useQuery({
    queryKey: ["nightly-close-history"],
    queryFn: () => fetchNightlyCloseHistory(),
  });

  const previewQuery = useQuery({
    queryKey: ["nightly-close-preview"],
    queryFn: previewNightlyClose,
    enabled: previewOpen,
  });

  const testSendMutation = useMutation({
    mutationFn: sendNightlyCloseTest,
    onSuccess: () => {
      toast.success("Test close sent.");
      queryClient.invalidateQueries({ queryKey: ["nightly-close-history"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send the test close — please try again.");
    },
  });

  const stats = useMemo(() => {
    if (!history || history.length === 0) return null;
    const last = history[0];
    const sentCount = history.filter((h) => h.deliveryStatus === "sent").length;
    return {
      lastSent: last.date,
      lastStatus: last.deliveryStatus,
      successRate: Math.round((sentCount / history.length) * 100),
      channel: last.channel,
    };
  }, [history]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-fg-muted" aria-hidden />
            <CardTitle>Nightly Close</CardTitle>
            {stats && <Badge tone={stats.lastStatus === "sent" ? "success" : "danger"}>{stats.lastStatus === "sent" ? "Delivering" : "Last send failed"}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Preview tonight&apos;s close
            </Button>
            <Button variant="outline" size="sm" onClick={() => testSendMutation.mutate()} disabled={testSendMutation.isPending}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              {testSendMutation.isPending ? "Sending…" : "Send test now"}
            </Button>
            {session.user.role === "owner" && (
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Change time
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Last sent" value={formatDate(stats.lastSent)} />
              <StatCard label="Delivery status" value={stats.lastStatus === "sent" ? "Sent" : "Failed"} />
              <StatCard label="Success rate (30 days)" value={`${stats.successRate}%`} />
              <StatCard label="Channel" value={stats.channel} />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">No history yet — your first Nightly Close sends tonight.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {isError && (
            <div className="p-4">
              <ErrorBanner title="Couldn't load Nightly Close history" onRetry={() => refetch()} />
            </div>
          )}
          {history && history.length === 0 && (
            <EmptyState icon={Moon} title="Your first Nightly Close sends tonight" description="A daily summary of sales, profit, reviews and bookings, delivered automatically." />
          )}
          {history && history.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 text-end font-medium">Sales</th>
                    <th className="px-5 py-2 text-end font-medium">Profit</th>
                    <th className="px-5 py-2 text-end font-medium">Reviews</th>
                    <th className="px-5 py-2 text-end font-medium">Bookings tomorrow</th>
                    <th className="px-5 py-2 text-end font-medium">Credit recovered</th>
                    <th className="px-5 py-2 font-medium">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((row) => (
                    <tr key={row.date}>
                      <td className="px-5 py-2.5 text-fg-muted">{formatDate(row.date)}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{row.sales}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{formatCurrency(row.profit, session.business.currency)}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{row.newReviews}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{row.bookingsTomorrow}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{formatCurrency(row.creditRecovered, session.business.currency)}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={row.deliveryStatus === "sent" ? "success" : "danger"}>{row.deliveryStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} data={previewQuery.data} isPending={previewQuery.isPending} currency={session.business.currency} />
      <NightlyCloseSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 px-3.5 py-2.5">
      <p className="font-display text-lg font-bold text-fg">{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}

function PreviewDialog({
  open,
  onClose,
  data,
  isPending,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  data?: NightlyClosePreview;
  isPending: boolean;
  currency: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Tonight's close preview">
      {isPending && <SkeletonRow />}
      {data && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-fg-muted">{data.dateLabel}</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Orders" value={String(data.ordersCount)} />
            <StatCard label="Revenue" value={formatCurrency(data.revenue, currency)} />
            <StatCard label="Gross profit" value={formatCurrency(data.grossProfit, currency)} />
            <StatCard label="Bookings tomorrow" value={String(data.appointmentsTomorrowCount)} />
          </div>
          {data.lowStockProducts.length > 0 && (
            <p className="text-xs text-fg-faint">{data.lowStockProducts.length} low-stock item(s) will be flagged.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function NightlyCloseSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <NightlyCloseSettingsDialogBody onClose={onClose} />;
}

function NightlyCloseSettingsDialogBody({ onClose }: { onClose: () => void }) {
  const [time, setTime] = useState("22:00");
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateNightlyCloseSettings({ time, channel }),
    onSuccess: () => {
      toast.success("Nightly Close settings saved.");
      queryClient.invalidateQueries({ queryKey: ["nightly-close-history"] });
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again.");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nightly Close settings"
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
      <div className="flex flex-col gap-3.5">
        <Input type="time" label="Send time" value={time} onChange={(e) => setTime(e.target.value)} />
        <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </Select>
      </div>
    </Dialog>
  );
}
