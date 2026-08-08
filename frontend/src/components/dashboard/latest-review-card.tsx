"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/shared/skeleton";
import { fetchReviewsSummary } from "@/lib/reviews-api";
import { daysAgo } from "@/lib/format";

const PLATFORM_LABEL: Record<string, string> = { google: "Google", gmb: "Google", facebook: "Facebook", yelp: "Yelp" };

function timeAgo(iso: string): string {
  const days = daysAgo(iso);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function LatestReviewCard() {
  const { data: summary, isPending } = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });

  if (isPending) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  const review = summary?.latestReview;
  if (!review) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-xs font-medium text-fg-muted">Latest review</p>
        <p className="text-sm text-fg-faint">No reviews yet.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-fg-muted">Latest review</p>
        <span className="text-[11px] text-fg-faint">{timeAgo(review.createdAt)}</span>
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={i < review.stars ? "h-3.5 w-3.5 fill-accent text-accent" : "h-3.5 w-3.5 text-border-strong"}
            aria-hidden
          />
        ))}
      </div>
      <p className="line-clamp-3 text-sm text-fg">&ldquo;{review.text ?? "(no text left with this review)"}&rdquo;</p>
      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="text-xs text-fg-faint">
          {review.author ?? "Anonymous"} · {PLATFORM_LABEL[review.platform] ?? review.platform}
        </p>
        <Link
          href="/reviews"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          View all
        </Link>
      </div>
    </Card>
  );
}
