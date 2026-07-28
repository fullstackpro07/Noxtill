"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ReviewsSummaryPanel } from "./reviews-summary-panel";
import { ReviewFilterBar, type InboxFilters } from "./review-filter-bar";
import { ReviewCard } from "./review-card";
import { ComplaintInlineCard } from "./complaint-inline-card";
import { unifiedInbox } from "@/lib/reviews";
import { daysAgo } from "@/lib/format";

const DATE_WINDOW: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };

export function ReviewsInboxView() {
  const [filters, setFilters] = useState<InboxFilters>({ platform: "all", rating: "all", status: "all", date: "all" });

  const entries = useMemo(() => {
    return unifiedInbox().filter((entry) => {
      if (filters.platform !== "all" && (entry.kind !== "review" || entry.platform !== filters.platform)) return false;
      if (filters.rating !== "all" && entry.rating !== Number(filters.rating)) return false;
      if (filters.status !== "all" && entry.status !== filters.status) return false;
      const window = DATE_WINDOW[filters.date];
      if (window !== null && daysAgo(entry.date) > window) return false;
      return true;
    });
  }, [filters]);

  return (
    <div className="flex flex-col gap-5">
      <ReviewsSummaryPanel />
      <ReviewFilterBar filters={filters} onChange={setFilters} />
      {entries.length === 0 ? (
        <EmptyState icon={Inbox} title="No reviews match" description="Try a different filter." />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) =>
            entry.kind === "review" ? <ReviewCard key={entry.id} review={entry} /> : <ComplaintInlineCard key={entry.id} complaint={entry} />,
          )}
        </div>
      )}
    </div>
  );
}
