"use client";

import { useMemo } from "react";
import { ErrorBanner } from "@/components/shared/error-states";
import type { LiveExternalReview } from "@/lib/reviews-api";
import { THEMES, shortDate, themeCounts } from "@/lib/competitive-insights";
import { useCompetitiveData } from "../competitive-data";
import { useCompetitiveUi } from "../competitive-store";
import { Card, EmptyCard, SkeletonBlock, TableCard, Th } from "../competitive-ui";

const DAY = 86_400_000;

export function ReputationScreen() {
  const data = useCompetitiveData();
  const openModal = useCompetitiveUi((s) => s.openModal);

  const model = useMemo(() => {
    const external = data.reviews.filter((r): r is LiveExternalReview => r.source === "external");
    const yourTexts = external.map((r) => r.text ?? "").filter(Boolean);
    const yourCounts = themeCounts(yourTexts);
    const competitorTexts: string[] = [];
    const rows = data.competitors.map((c) => {
      const texts = (data.details[c.id]?.reviews ?? []).map((r) => r.text).filter(Boolean);
      competitorTexts.push(...texts);
      const counts = themeCounts(texts);
      const h = data.history[c.id] ?? [];
      const monthAgo = data.now.getTime() - 30 * DAY;
      const base = [...h].reverse().find((p) => new Date(p.capturedAt).getTime() <= monthAgo) ?? h[0];
      const delta = base && c.lastReviewsCount != null ? c.lastReviewsCount - base.reviewsCount : null;
      return {
        id: c.id,
        who: c.name,
        rating: c.lastRating != null ? Number(c.lastRating) : null,
        reviews: c.lastReviewsCount,
        recent:
          delta != null && base && h.length > 1
            ? `${delta >= 0 ? "+" : ""}${delta} ${new Date(base.capturedAt).getTime() <= monthAgo ? "in 30 days" : `since ${shortDate(new Date(base.capturedAt))}`}`
            : "—",
        themes: THEMES.filter((t) => counts[t.key] > 0)
          .sort((a, b) => counts[b.key] - counts[a.key])
          .slice(0, 3)
          .map((t) => t.label)
          .join(", "),
        loaded: !!data.details[c.id],
      };
    });
    const themeRows = THEMES.map((t) => ({
      key: t.key,
      label: t.label,
      them: themeCounts(competitorTexts)[t.key],
      you: yourCounts[t.key],
    })).filter((t) => t.them > 0 || t.you > 0);

    const monthAgo = data.now.getTime() - 30 * DAY;
    const yourRecent = external.filter((r) => new Date(r.createdAt).getTime() >= monthAgo).length;
    const yourThemes = THEMES.filter((t) => yourCounts[t.key] > 0)
      .sort((a, b) => yourCounts[b.key] - yourCounts[a.key])
      .slice(0, 3)
      .map((t) => t.label)
      .join(", ");
    return { rows, themeRows, yourRecent, yourThemes, yourReviewTexts: yourTexts.length, competitorTextCount: competitorTexts.length };
  }, [data.reviews, data.competitors, data.history, data.now, data.details]);

  if (data.error) return <ErrorBanner title="Couldn't load competitors" onRetry={data.refetch} />;
  if (data.loading) return <SkeletonBlock h={280} />;

  const you = {
    rating: data.input.yourRating,
    reviews: data.input.yourReviewCount,
    replied: data.input.yourReplyRate,
  };

  return (
    <div className="flex flex-col gap-[15px]">
      {data.competitors.length === 0 ? (
        <EmptyCard
          title="Add competitors to compare reputations"
          body="Their public rating and review count are read from Google each week."
          action={{ label: "Add competitor", onClick: () => openModal({ type: "add" }) }}
        />
      ) : null}
      <Card overflow>
        <TableCard
          minWidth={820}
          head={
            <>
              <Th edge>Business</Th>
              <Th align="right">Rating</Th>
              <Th align="right">Reviews</Th>
              <Th>Recent</Th>
              <Th align="right">Replied to</Th>
              <Th edge>What people mention</Th>
            </>
          }
        >
          <tr className="border-t border-[#F2F4F7] bg-[#F7FCF9]">
            <td className="px-[17px] py-3">
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-[#101828]">Your business</span>
                <span className="rounded-[5px] bg-[#E8F7EE] px-[7px] py-0.5 text-[9.5px] font-extrabold text-[#0E8442]">You</span>
              </span>
            </td>
            <td className="p-3 text-right text-[13px] font-extrabold text-[#101828]">{you.rating != null ? you.rating.toFixed(1) : "—"}</td>
            <td className="p-3 text-right text-[12.5px] text-[#475467]">{you.reviews}</td>
            <td className="p-3 text-[12px] text-[#667085]">{`+${model.yourRecent} in 30 days`}</td>
            <td
              className="p-3 text-right text-[12.5px] font-extrabold"
              style={{ color: you.replied == null ? "#98A2B3" : you.replied > 50 ? "#0E8442" : you.replied > 20 ? "#B54708" : "#B42318" }}
            >
              {you.replied != null ? `${Math.round(you.replied)}%` : "—"}
            </td>
            <td className="px-[17px] py-3 text-[12px] text-[#667085]">{model.yourThemes || "—"}</td>
          </tr>
          {model.rows
            .slice()
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
            .map((r) => (
              <tr key={r.id} className="border-t border-[#F2F4F7]">
                <td className="px-[17px] py-3 text-[12.5px] font-bold text-[#101828]">{r.who}</td>
                <td className="p-3 text-right text-[13px] font-extrabold text-[#101828]">{r.rating != null ? r.rating.toFixed(1) : "—"}</td>
                <td className="p-3 text-right text-[12.5px] text-[#475467]">{r.reviews ?? "—"}</td>
                <td className="p-3 text-[12px] text-[#667085]">{r.recent}</td>
                <td className="p-3 text-right text-[12px] italic text-[#98A2B3]" title="Google's public listing data does not include a business's replies to its reviews">
                  Not available
                </td>
                <td className="px-[17px] py-3 text-[12px] text-[#667085]">{r.themes || (r.loaded ? "—" : "Loading…")}</td>
              </tr>
            ))}
        </TableCard>
      </Card>

      <Card pad>
        <h3 className="m-0 mb-1 text-[14.5px] font-extrabold text-[#101828]">What reviewers keep bringing up</h3>
        <p className="m-0 mb-3.5 text-[11.5px] text-[#98A2B3]">
          {model.competitorTextCount > 0
            ? `Counted from public review text: your ${model.yourReviewTexts} written review${model.yourReviewTexts === 1 ? "" : "s"} and the ${model.competitorTextCount} most recent ones Google shares for competitors (a handful each) — a sample, not a census.`
            : `Counted from your ${model.yourReviewTexts} written review${model.yourReviewTexts === 1 ? "" : "s"}. Competitor review text isn't available right now (it comes from Google Places), so no competitor comparison is shown.`}
        </p>
        {model.themeRows.length === 0 ? (
          <div className="rounded-[12px] border border-[#E6EAF0] p-[13px] text-[12.5px] text-[#98A2B3]">No recurring topics found in the review text available.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {model.themeRows.map((t) => (
              <div key={t.key} className="rounded-[12px] border border-[#E6EAF0] p-[13px]">
                <div className="text-[12.5px] font-extrabold text-[#101828]">{t.label}</div>
                <div className="mt-[7px] flex flex-wrap gap-[18px]">
                  <span className="text-[11.5px] text-[#667085]">
                    {model.competitorTextCount > 0 ? `Mentioned in ${t.them} competitor review${t.them === 1 ? "" : "s"}` : "Competitor reviews not available"}
                  </span>
                  <span className="text-[11.5px] font-bold text-[#0E8442]">
                    Mentioned in {t.you} of yours
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
