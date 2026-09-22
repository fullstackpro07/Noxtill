"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, ExternalLink } from "lucide-react";
import { useListings } from "../listings-context";

export function CompetitorsScreen() {
  const router = useRouter();
  const {
    competitors,
    masterListing,
    reviews,
    reviewsSummary,
    listingPhotos,
    gmbPhotos,
    services,
    gmbPosts,
    openPanel,
    notify,
  } = useListings();

  const competitorCards = useMemo(() => {
    if (competitors && competitors.length > 0) {
      return competitors.map((c, i) => {
        const initials =
          c.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "CP";

        const hasHistory = c.weeklyRatings && c.weeklyRatings.length > 1;
        const trend = hasHistory
          ? c.weeklyRatings[c.weeklyRatings.length - 1] - c.weeklyRatings[0]
          : 0;

        return {
          id: c.id,
          name: c.name,
          initials,
          meta: `Tracked competitor · #${i + 1}`,
          changeBadge: hasHistory ? (trend > 0 ? "+ Rating up" : trend < 0 ? "— Rating down" : "Stable") : null,
          tone: hasHistory && trend < 0 ? "amber" : "neutral",
          weeklyCount: c.weeklyRatings ? c.weeklyRatings.length : 0,
          stats: [
            { label: "Rating", value: c.rating != null ? c.rating.toFixed(1) : "—" },
            { label: "Reviews", value: c.reviewCount != null ? String(c.reviewCount) : "0" },
            { label: "Photos", value: "Not tracked" },
            { label: "Services", value: "Not tracked" },
          ],
          observation: `Public listing rating is currently ${
            c.rating != null ? c.rating.toFixed(1) : "unrated"
          } based on ${c.reviewCount || 0} public reviews. Internal metrics like revenue and customer counts are never inferred.`,
        };
      });
    }
    return [];
  }, [competitors]);

  const bizName = masterListing?.name || "You";

  const comparisonRows = useMemo(() => {
    const yourRating = reviewsSummary?.averageRating ? reviewsSummary.averageRating.toFixed(1) : "Not rated";
    const yourReviews = String(reviews.length);
    const yourPhotos = String(listingPhotos.length + gmbPhotos.length);
    const yourServices = String(services.length);
    const yourDesc = masterListing?.description ? "Set" : "Empty";
    const yourPosts = String(gmbPosts.length);
    const yourSpecial = Boolean(masterListing?.hours && (masterListing.hours as Record<string, unknown>).special) ? "Yes" : "No";

    return [
      {
        field: "Public rating",
        you: yourRating,
        tone: yourRating !== "Not rated" ? "pos" : "neutral",
        competitorsVal: (c: typeof competitors[0]) => (c.rating != null ? c.rating.toFixed(1) : "—"),
      },
      {
        field: "Public review count",
        you: yourReviews,
        tone: "neutral",
        competitorsVal: (c: typeof competitors[0]) => (c.reviewCount != null ? String(c.reviewCount) : "0"),
      },
      {
        field: "Photos",
        you: yourPhotos,
        tone: "neutral",
        competitorsVal: () => "Not tracked",
      },
      {
        field: "Services listed",
        you: yourServices,
        tone: "neutral",
        competitorsVal: () => "Not tracked",
      },
      {
        field: "Description",
        you: yourDesc,
        tone: yourDesc === "Set" ? "pos" : "neutral",
        competitorsVal: () => "Public only",
      },
      {
        field: "Business posts · 30 days",
        you: yourPosts,
        tone: "neutral",
        competitorsVal: () => "Not tracked",
      },
      {
        field: "Special hours set",
        you: yourSpecial,
        tone: yourSpecial === "Yes" ? "pos" : "neutral",
        competitorsVal: () => "Not tracked",
      },
    ];
  }, [reviewsSummary, reviews, listingPhotos, gmbPhotos, services, masterListing, gmbPosts]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#FDE49B] bg-white p-4 shadow-sm">
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-[#B45309]" />
        <div className="min-w-[220px] flex-1 text-[11.5px] leading-relaxed text-[#B45309]">
          Only publicly visible listing information is monitored. Noxtill does not and cannot show a competitor&apos;s revenue, customers, strategy or search ranking — anything presented as such would be invented.
        </div>
        <button
          onClick={() => router.push("/marketing")}
          className="flex h-[30px] items-center gap-1.5 rounded-lg border border-[#FDE49B] bg-[#FFFDF5] px-2.5 text-[12px] font-bold text-[#B45309] hover:bg-[#FEF3C7]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Marketing module</span>
        </button>
      </div>

      {/* Competitor Cards Grid */}
      {competitorCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitorCards.map((cc) => (
            <div
              key={cc.id}
              onClick={() =>
                openPanel({
                  kicker: "Competitor",
                  title: cc.name,
                  badge: cc.changeBadge || "Tracked",
                  badgeTone: (["green", "amber", "red", "blue", "neutral"].includes(cc.tone)
                    ? cc.tone
                    : "neutral") as "green" | "amber" | "red" | "blue" | "neutral",
                  rows: [
                    ["Location", cc.meta],
                    ["Public rating", cc.stats[0].value],
                    ["Public review count", cc.stats[1].value],
                    ["Weekly snapshots", `${cc.weeklyCount} recorded`],
                    ["Public photos", "Not tracked via listings API", "muted"],
                    ["Public services listed", "Not tracked via listings API", "muted"],
                    ["Revenue", "Not available", "muted"],
                    ["Customers", "Not available", "muted"],
                    ["Search ranking", "Not available", "muted"],
                  ],
                  bulletsTitle: "Monitored publicly",
                  bullets: [
                    "Rating and review count from Google Places public listing",
                    "Snapshotted weekly by the background processor",
                    "Never infers private commercial data",
                  ],
                  note: "Competitor tracking is limited to 5 per business.",
                  primary: "Manage in Marketing",
                  secondary: "Close",
                  onPrimary: () => router.push("/marketing"),
                })
              }
              className="cursor-pointer rounded-[13px] border border-[#E6E8EC] bg-white p-4 shadow-sm transition-all hover:border-[#CBD5E1] hover:shadow-md"
            >
              {/* Card Header */}
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F5F3FF] text-[13px] font-black text-[#6D28D9]">
                  {cc.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-extrabold text-[#0F172A]">{cc.name}</div>
                  <div className="mt-0.5 text-[11px] text-[#94A3B8]">{cc.meta}</div>
                </div>
                {cc.changeBadge && (
                  <span className="inline-flex h-5 items-center rounded-full border border-[#FDE49B] bg-[#FFFBEB] px-2 text-[10px] font-bold text-[#B45309]">
                    {cc.changeBadge}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="mt-3.5 grid grid-cols-4 gap-2 border-t border-[#EEF0F3] pt-3">
                {cc.stats.map((st, sIdx) => (
                  <div key={sIdx}>
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      {st.label}
                    </div>
                    <div className="mt-0.5 text-[14px] font-extrabold font-mono tabular-nums text-[#0F172A]">
                      {st.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Observation */}
              <div className="mt-3 rounded-lg border border-[#F1F3F6] bg-[#FAFBFC] p-2.5 text-[11px] leading-relaxed text-[#5B6675]">
                {cc.observation}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-[13px] border border-dashed border-[#D5DAE2] bg-white p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F3FF] text-[#6D28D9]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="mt-3 text-[15px] font-extrabold text-[#0F172A]">
            No competitors tracked yet
          </div>
          <p className="mt-1 max-w-[420px] text-[12px] leading-relaxed text-[#7A8798]">
            Track up to 5 local competitors to compare their public Google listing ratings and review volume alongside your own.
          </p>
          <button
            onClick={() => router.push("/marketing")}
            className="mt-4 flex h-[34px] items-center gap-1.5 rounded-lg bg-[#0F172A] px-3.5 text-[12px] font-bold text-white hover:bg-[#1E293B]"
          >
            <Plus className="h-4 w-4" />
            <span>Track competitor in Marketing</span>
          </button>
        </div>
      )}

      {/* Public Listing Comparison Table */}
      <div className="overflow-hidden rounded-[13px] border border-[#E6E8EC] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] p-4">
          <div className="text-[13.5px] font-extrabold text-[#0F172A]">
            Public listing comparison
          </div>
          <div className="ml-auto text-[11px] text-[#94A3B8]">Publicly visible fields only</div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC] text-[10.5px] font-extrabold uppercase tracking-wider text-[#7A8798]">
                <th className="pl-4 py-3">Field</th>
                <th className="px-3 py-3">You ({bizName})</th>
                {competitors.map((c) => (
                  <th key={c.id} className="px-3 py-3">
                    {c.name}
                  </th>
                ))}
                {competitors.length === 0 && (
                  <th className="pr-4 py-3 text-[#94A3B8]">Tracked Competitors</th>
                )}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((cmp, idx) => (
                <tr
                  key={idx}
                  onClick={() =>
                    notify(cmp.field, `You: ${cmp.you} · a publicly readable comparison, nothing inferred.`)
                  }
                  className={`cursor-pointer border-b border-[#F3F4F7] transition-colors hover:bg-[#FAFBFC] ${
                    cmp.tone === "pos" ? "bg-[#FDFEFE]" : "bg-white"
                  }`}
                >
                  <td className="pl-4 py-3 text-[12px] font-bold text-[#0F172A] whitespace-nowrap">
                    {cmp.field}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[11.5px] font-extrabold tabular-nums ${
                        cmp.tone === "pos"
                          ? "bg-[#ECFDF3] text-[#15803D]"
                          : "bg-[#F1F3F6] text-[#45505F]"
                      }`}
                    >
                      {cmp.you}
                    </span>
                  </td>
                  {competitors.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-[11.5px] text-[#45505F] whitespace-nowrap">
                      {cmp.competitorsVal(c)}
                    </td>
                  ))}
                  {competitors.length === 0 && (
                    <td className="pr-4 py-3 text-[11px] text-[#94A3B8] italic whitespace-nowrap">
                      No competitors tracked
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
