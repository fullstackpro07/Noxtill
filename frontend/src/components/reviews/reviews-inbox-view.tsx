"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { ReviewsSummaryPanel } from "./reviews-summary-panel";
import { ReviewFilterBar, type InboxFilters } from "./review-filter-bar";
import { ReviewCard } from "./review-card";
import { ComplaintInlineCard } from "./complaint-inline-card";
import { fetchReviews } from "@/lib/reviews-api";
import { fetchCustomers } from "@/lib/customers-api";
import { daysAgo } from "@/lib/format";

const DATE_WINDOW: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };

export function ReviewsInboxView() {
  const [filters, setFilters] = useState<InboxFilters>({ platform: "all", rating: "all", status: "all", date: "all" });

  const {
    data: entries = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const customerNames = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const platforms = useMemo(
    () => [...new Set(entries.filter((e) => e.source === "external").map((e) => e.platform))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (filters.platform !== "all") {
        if (filters.platform === "private" ? entry.source !== "private" : entry.source !== "external" || entry.platform !== filters.platform) {
          return false;
        }
      }
      if (filters.rating !== "all" && entry.stars !== Number(filters.rating)) return false;
      if (filters.status !== "all") {
        const status = entry.source === "external" ? (entry.replyText ? "replied" : "new") : entry.status;
        if (status !== filters.status) return false;
      }
      const window = DATE_WINDOW[filters.date];
      if (window !== null && daysAgo(entry.createdAt) > window) return false;
      return true;
    });
  }, [entries, filters]);

  return (
    <div className="flex flex-col gap-5">
      <ReviewsSummaryPanel />
      <ReviewFilterBar filters={filters} onChange={setFilters} platforms={platforms} />
      {isError ? (
        <ErrorBanner title="Couldn't load reviews" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="No reviews match" description="Try a different filter." />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entry) =>
            entry.source === "external" ? (
              <ReviewCard key={entry.id} review={entry} />
            ) : (
              <ComplaintInlineCard
                key={entry.id}
                complaint={entry}
                customerName={entry.customerId ? (customerNames.get(entry.customerId) ?? "Customer") : "Anonymous"}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
