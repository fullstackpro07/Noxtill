"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, X, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { QuotaModal } from "@/components/shared/quota-modal";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchReviewRequests,
  fetchReviewRequestsConversion,
  bulkSendReviewRequests,
  type ReviewRequestEffectiveStatus,
} from "@/lib/reviews-api";
import { fetchQuotaUsage } from "@/lib/campaigns-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const STATUS_TONE: Record<ReviewRequestEffectiveStatus, "neutral" | "warning" | "success" | "danger"> = {
  sent: "neutral",
  opened: "warning",
  rated: "success",
  no_response: "danger",
};

const STATUS_LABEL: Record<ReviewRequestEffectiveStatus, string> = {
  sent: "Sent",
  opened: "Opened",
  rated: "Rated",
  no_response: "No response",
};

export function ReviewRequestsPanel() {
  const [sendOpen, setSendOpen] = useState(false);

  const { data: requests, isPending, isError, refetch } = useQuery({ queryKey: ["review-requests"], queryFn: fetchReviewRequests });
  const { data: conversion } = useQuery({ queryKey: ["review-requests-conversion"], queryFn: fetchReviewRequestsConversion });

  const maxTotal = Math.max(1, ...(conversion ?? []).map((c) => c.total));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send requests
        </Button>
      </div>

      {conversion && conversion.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-medium text-fg">Conversion by channel — last 30 days</p>
            <div className="flex flex-col gap-2.5">
              {conversion.map((c) => (
                <div key={c.source} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs text-fg-muted">{c.source}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-[4px] bg-surface-2">
                    <div
                      className="h-full rounded-[4px] bg-chart-1/50 transition-[width]"
                      style={{ width: `${(c.total / maxTotal) * 100}%` }}
                      title={`${c.total} sent, ${c.rated} rated`}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-end text-xs tabular-nums text-fg-faint">
                    {c.rated}/{c.total} · {c.conversionRate}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load review requests" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {requests && requests.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={MessageSquare} title="No review requests yet" description="Send your first batch to start collecting reviews." />
          </CardContent>
        </Card>
      )}

      {requests && requests.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Customer</th>
                <th className="px-4 py-3 text-start">Source</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Rating</th>
                <th className="px-4 py-3 text-start">Sent</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-fg">{r.customer?.name ?? "Anonymous"}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.source}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[r.effectiveStatus]}>{STATUS_LABEL[r.effectiveStatus]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-accent-foreground">{r.stars ? "★".repeat(r.stars) : "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sendOpen && <SendRequestsDialog onClose={() => setSendOpen(false)} />}
    </div>
  );
}

function SendRequestsDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult[]>([]);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);

  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1,
  });
  const { data: quotaUsage } = useQuery({ queryKey: ["quota-usage"], queryFn: fetchQuotaUsage });
  const used = quotaUsage?.used ?? 0;
  const quota = quotaUsage?.quota ?? 0;
  const remaining = quota - used;
  const insufficientQuota = selected.length > remaining;

  const selectedIds = new Set(selected.map((c) => c.id));
  const candidates = (results ?? []).filter((c) => !selectedIds.has(c.id));

  const sendMutation = useMutation({
    mutationFn: () => bulkSendReviewRequests(selected.map((c) => c.id)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["review-requests"] });
      queryClient.invalidateQueries({ queryKey: ["quota-usage"] });
      toast.success(`Sent to ${result.sent} of ${result.requested} customer(s).`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "REVIEW_REQUEST_QUOTA_EXCEEDED") {
        setQuotaModalOpen(true);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't send these requests — please try again.");
    },
  });

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title="Send review requests"
        description="Each customer gets a link 2 hours from now — timed so it doesn't feel automated."
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={sendMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={selected.length === 0 || sendMutation.isPending}>
              {sendMutation.isPending ? "Sending…" : `Send to ${selected.length || ""}`.trim()}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 ps-2.5 pe-1.5 text-xs text-fg">
                  {c.name}
                  <button
                    type="button"
                    onClick={() => setSelected((prev) => prev.filter((s) => s.id !== c.id))}
                    aria-label={`Remove ${c.name}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-surface"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers by name or phone…" autoFocus />
          {candidates.length > 0 && (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelected((prev) => [...prev, c]);
                    setQuery("");
                  }}
                  className="flex flex-col items-start px-3 py-2 text-start text-sm hover:bg-surface-2"
                >
                  <span className="text-fg">{c.name}</span>
                  <span className="text-xs text-fg-faint">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
          {quota > 0 && (
            <p className={insufficientQuota ? "text-xs font-medium text-destructive" : "text-xs text-fg-faint"}>
              {selected.length} of {remaining} remaining message{remaining === 1 ? "" : "s"} this month
              {insufficientQuota ? " — not enough quota for this send" : ""}
            </p>
          )}
        </div>
      </Dialog>

      <QuotaModal
        open={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        onUpgrade={() => {
          setQuotaModalOpen(false);
          router.push("/settings/billing");
        }}
        used={used}
        quota={quota}
      />
    </>
  );
}
