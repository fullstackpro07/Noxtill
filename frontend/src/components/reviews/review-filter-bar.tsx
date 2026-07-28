"use client";

import { Select } from "@/components/ui/select";
import { PLATFORM_LABELS, type ReviewPlatform } from "@/lib/reviews";

export type PlatformFilter = "all" | ReviewPlatform;
export type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
export type StatusFilter = "all" | "new" | "replied" | "open" | "resolved";
export type DateFilter = "all" | "7d" | "30d" | "90d";

export interface InboxFilters {
  platform: PlatformFilter;
  rating: RatingFilter;
  status: StatusFilter;
  date: DateFilter;
}

export function ReviewFilterBar({ filters, onChange }: { filters: InboxFilters; onChange: (f: InboxFilters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select
        value={filters.platform}
        onChange={(e) => onChange({ ...filters, platform: e.target.value as PlatformFilter })}
        className="w-40"
      >
        <option value="all">All platforms</option>
        {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select value={filters.rating} onChange={(e) => onChange({ ...filters, rating: e.target.value as RatingFilter })} className="w-32">
        <option value="all">All ratings</option>
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {n} star{n === 1 ? "" : "s"}
          </option>
        ))}
      </Select>
      <Select value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })} className="w-36">
        <option value="all">All statuses</option>
        <option value="new">New</option>
        <option value="replied">Replied</option>
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
      </Select>
      <Select value={filters.date} onChange={(e) => onChange({ ...filters, date: e.target.value as DateFilter })} className="w-36">
        <option value="all">All time</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </Select>
    </div>
  );
}
