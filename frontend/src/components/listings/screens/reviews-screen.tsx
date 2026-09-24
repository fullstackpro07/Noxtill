"use client";

import React from "react";
import Link from "next/link";
import { Info, ExternalLink, Star } from "lucide-react";
import { useListings } from "../listings-context";

export function ReviewsScreen() {
  const { reviews, reviewsSummary, listings, currentBranchId, openPanel, notify } = useListings();

  const totalReviews = reviewsSummary?.distribution?.reduce((sum, d) => sum + d.count, 0) ?? reviews.length;
  const unanswered = reviews.filter((r) => (r.source === "external" ? !r.replyText : r.status === "open")).length;
  const negative = reviews.filter((r) => r.stars <= 2).length;
  const responseRate = totalReviews > 0 ? Math.round(((totalReviews - unanswered) / totalReviews) * 100) : null;
  const disconnectedCount = listings.filter((l) => l.status === "Disconnected").length;

  const reviewKpis = [
    { label: "Average rating", value: reviewsSummary?.averageRating ? reviewsSummary.averageRating.toFixed(1) : "No reviews", meta: "for your active location", tone: "green" },
    { label: "Total reviews", value: String(totalReviews), meta: "single review database", tone: "neutral" },
    { label: "Unanswered", value: String(unanswered), meta: unanswered > 0 ? "awaiting reply" : "all answered", tone: unanswered > 0 ? "amber" : "green" },
    { label: "Negative", value: String(negative), meta: "2 stars or below", tone: negative > 0 ? "amber" : "green" },
    { label: "Response rate", value: responseRate != null ? `${responseRate}%` : "—", meta: "of reviews replied to", tone: responseRate != null && responseRate >= 95 ? "green" : "amber" },
    { label: "Unreadable listings", value: String(disconnectedCount), meta: disconnectedCount > 0 ? "disconnected" : "all accessible", tone: disconnectedCount > 0 ? "red" : "green" },
  ];

  // Real per-branch breakdown — review data itself is only fetched for whichever branch is
  // currently active, so other branches disclose that rather than showing invented numbers.
  const branchRows = React.useMemo(() => {
    const byBranch = new Map<string, { branchId: string; name: string; providers: string[] }>();
    listings.forEach((l) => {
      if (!byBranch.has(l.branchId)) byBranch.set(l.branchId, { branchId: l.branchId, name: l.location, providers: [] });
      byBranch.get(l.branchId)!.providers.push(l.platformShort);
    });
    return [...byBranch.values()];
  }, [listings]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-[#E6E8EC] bg-white p-4 shadow-sm">
        <Info className="h-4 w-4 flex-shrink-0 text-[#7A8798]" />
        <div className="min-w-[220px] flex-1 text-[11.5px] leading-relaxed text-[#5B6675]">
          Reviews live in Reviews &amp; Reputation. This screen shows a summary for your active location — there is no second review database anywhere in Noxtill.
        </div>
        <Link
          href="/reviews"
          className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#0F172A] hover:bg-[#F1F3F6]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Open Reviews</span>
        </Link>
      </div>

      {/* 6 Real Review KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {reviewKpis.map((k, idx) => (
          <div
            key={idx}
            onClick={() => notify(`${k.label} · ${k.value}`, k.meta)}
            className={`cursor-pointer rounded-[12px] border bg-white p-3.5 shadow-sm transition-all hover:border-[#CBD5E1] ${
              k.tone === "red"
                ? "border-[#FBD5D2]"
                : k.tone === "amber"
                ? "border-[#FDE49B]"
                : "border-[#E6E8EC]"
            }`}
          >
            <div className="text-[11.5px] font-bold text-[#5B6675]">{k.label}</div>
            <div
              className={`mt-1.5 text-[19px] font-extrabold tracking-tight ${
                k.tone === "red"
                  ? "text-[#B42318]"
                  : k.tone === "amber"
                  ? "text-[#B45309]"
                  : "text-[#0F172A]"
              }`}
            >
              {k.value}
            </div>
            <div className="mt-1 text-[10.5px] text-[#94A3B8]">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* By Location Table */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="border-b border-[#EEF0F3] p-4 text-[13.5px] font-extrabold text-[#0F172A]">
          By location
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A8798]">
                <th className="pl-4 py-3">Location</th>
                <th className="px-3 py-3">Connected directories</th>
                <th className="px-3 py-3 text-center">Rating</th>
                <th className="px-3 py-3 text-center">Reviews</th>
                <th className="pr-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map((br) => {
                const isCurrent = br.branchId === currentBranchId;
                return (
                  <tr
                    key={br.branchId}
                    onClick={() =>
                      openPanel({
                        kicker: "Location reviews",
                        title: br.name,
                        badge: isCurrent ? (reviewsSummary?.averageRating ? `${reviewsSummary.averageRating.toFixed(1)} from ${totalReviews}` : "No reviews yet") : "Not this location",
                        badgeTone: isCurrent ? "green" : "neutral",
                        rows: isCurrent
                          ? [
                              ["Rating", reviewsSummary?.averageRating ? reviewsSummary.averageRating.toFixed(1) : "No reviews yet"],
                              ["Reviews", String(totalReviews)],
                              ["Unanswered", String(unanswered)],
                              ["Owned by", "Reviews & Reputation module"],
                            ]
                          : [
                              ["Reason", "Reviews are only read for whichever location is currently active"],
                              ["To see this location's reviews", "Switch the active location, then reopen this screen"],
                            ],
                        bulletsTitle: "One review database",
                        bullets: [
                          "Reviews live in Reviews & Reputation — this is a summary, not a copy",
                          "Replying opens the review workspace there",
                          "No second review database exists anywhere in Noxtill",
                        ],
                        note: "Deep links open the real review record in the module that owns it.",
                        primary: "Open in Reviews",
                        secondary: "Close",
                      })
                    }
                    className={`cursor-pointer border-b border-[#F3F4F7] transition-colors hover:bg-[#FAFBFC] ${isCurrent ? "bg-white" : "bg-[#FCFCFD]"}`}
                  >
                    <td className="pl-4 py-3 text-[12px] font-bold text-[#0F172A] whitespace-nowrap">{br.name}</td>
                    <td className="px-3 py-3 text-[11.5px] text-[#45505F] whitespace-nowrap">{br.providers.join(", ")}</td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {isCurrent && reviewsSummary?.averageRating ? (
                        <span className="inline-flex items-center gap-1 rounded-[6px] bg-[#ECFDF3] px-2 py-0.5 font-mono text-[11px] font-extrabold text-[#15803D]">
                          <Star className="h-3 w-3 fill-[#15803D]" />
                          {reviewsSummary.averageRating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">{isCurrent ? "No reviews" : "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-[12px] tabular-nums text-[#0F172A] whitespace-nowrap">
                      {isCurrent ? totalReviews : "—"}
                    </td>
                    <td className="pr-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          notify(isCurrent ? "Opening Reviews & Reputation" : "Switch location first", isCurrent ? "Replies are written and approved there." : "This screen only reads reviews for the currently active location.");
                        }}
                        className="inline-flex h-[30px] items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#45505F] hover:bg-[#F1F3F6]"
                      >
                        {isCurrent ? "View" : "Switch location"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] p-3 px-4 text-[11px] text-[#94A3B8]">
          AI can draft a reply; a negative review always needs human approval before publishing.
        </div>
      </div>
    </div>
  );
}
