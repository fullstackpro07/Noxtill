"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ComplaintDrawer } from "./complaint-drawer";
import { fetchReviews, type LivePrivateFeedback, type FeedbackStatus } from "@/lib/reviews-api";
import { fetchCustomers } from "@/lib/customers-api";
import { formatDate } from "@/lib/format";

const STATUS_TONE: Record<FeedbackStatus, "danger" | "warning" | "success"> = {
  open: "danger",
  assigned: "warning",
  resolved: "success",
};

export function ComplaintsTable({ currency }: { currency: string }) {
  const [selected, setSelected] = useState<LivePrivateFeedback | null>(null);

  const {
    data: entries = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const complaints = useMemo(() => entries.filter((e): e is LivePrivateFeedback => e.source === "private"), [entries]);

  if (isError) {
    return <ErrorBanner title="Couldn't load complaints" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (complaints.length === 0) {
    return <EmptyState icon={MessageSquareWarning} title="No private feedback" description="Low-rated feedback lands here privately." />;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
              <th className="px-4 py-3 text-start">Customer</th>
              <th className="px-4 py-3 text-start">Rating</th>
              <th className="px-4 py-3 text-start">Feedback</th>
              <th className="px-4 py-3 text-start">Date</th>
              <th className="px-4 py-3 text-start">Status</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-4 py-3 font-medium text-fg">{c.customerId ? (customerNames.get(c.customerId) ?? "Customer") : "Anonymous"}</td>
                <td className="px-4 py-3 text-accent-foreground">{"★".repeat(c.stars)}</td>
                <td className="max-w-xs truncate px-4 py-3 text-fg-muted">{c.message ?? "(no message left)"}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ComplaintDrawer complaint={selected} currency={currency} onClose={() => setSelected(null)} />
    </>
  );
}
