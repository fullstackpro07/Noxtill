"use client";

import { Select } from "@/components/ui/select";

export type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
export type StatusFilter = "all" | "new" | "replied" | "open" | "assigned" | "resolved";
export type DateFilter = "all" | "7d" | "30d" | "90d";

export interface InboxFilters {
  platform: string;
  rating: RatingFilter;
  status: StatusFilter;
  date: DateFilter;
}

const PLATFORM_LABEL: Record<string, string> = {
  google: "Google",
  gmb: "Google",
  facebook: "Facebook",
  yelp: "Yelp",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** `platforms` is derived from whatever's actually in the live review list — there's no fixed platform roster to hardcode. */
export function ReviewFilterBar({
  filters,
  onChange,
  platforms,
}: {
  filters: InboxFilters;
  onChange: (f: InboxFilters) => void;
  platforms: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select value={filters.platform} onChange={(e) => onChange({ ...filters, platform: e.target.value })} className="w-40">
        <option value="all">All platforms</option>
        <option value="private">Private feedback</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {platformLabel(p)}
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
        <option value="assigned">Assigned</option>
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
