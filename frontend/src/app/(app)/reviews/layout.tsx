"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, Send } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useReviewsSearchStore } from "@/store/reviews-search-store";
import { fetchReviews } from "@/lib/reviews-api";
import { useSendReviewRequestDialog } from "@/components/reviews/send-review-request-dialog";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/reviews/private", subtitle: "Low-star feedback handled privately as tickets." },
  { prefix: "/reviews/requests", subtitle: "Requests sent and how they convert." },
  { prefix: "/reviews/rating-page", subtitle: "The page customers land on to rate you." },
  { prefix: "/reviews/widget", subtitle: "Embed your best reviews on your website." },
  { prefix: "/reviews/reputation", subtitle: "One measure of reputation health." },
  { prefix: "/reviews/sentiment", subtitle: "What customers praise and complain about." },
  { prefix: "/reviews/competitors", subtitle: "How you compare with nearby businesses." },
  { prefix: "/reviews/video-testimonials", subtitle: "Turn happy customers into short video reviews." },
  { prefix: "/reviews/settings", subtitle: "Configure the whole review engine." },
];

function ReviewsHeaderContent({ unrepliedCount }: { unrepliedCount: number }) {
  const pathname = usePathname();
  const query = useReviewsSearchStore((s) => s.query);
  const setQuery = useReviewsSearchStore((s) => s.setQuery);
  const sendDialog = useSendReviewRequestDialog();
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Every review from every platform in one inbox.";

  useModuleHeader({
    title: (
      <span className="flex items-center gap-2">
        Reviews &amp; Reputation
        {unrepliedCount > 0 && (
          <span className="rounded-full px-2.5 py-[3px] text-[11px] font-extrabold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>
            {unrepliedCount} unreplied
          </span>
        )}
      </span>
    ),
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reviews or customers..."
          aria-label="Search reviews"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <button
        type="button"
        onClick={sendDialog.open}
        className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
        style={{ background: "var(--app-primary)" }}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        Send Request
      </button>
    ),
  });

  return sendDialog.node;
}

export default function ReviewsLayout({ children }: { children: ReactNode }) {
  const { data: entries = [] } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });
  const unrepliedCount = useMemo(
    () => entries.filter((e) => (e.source === "external" ? !e.replyText : e.status === "open")).length,
    [entries],
  );
  const openTicketCount = useMemo(
    () => entries.filter((e) => e.source === "private" && e.status !== "resolved").length,
    [entries],
  );

  return (
    <div className="flex min-h-full flex-col">
      <ReviewsHeaderContent unrepliedCount={unrepliedCount} />
      <ModuleTabs
        moduleKey="reviews"
        badges={{
          "all-reviews": { count: unrepliedCount },
          "private-reviews": { count: openTicketCount, tone: "warning" },
        }}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
