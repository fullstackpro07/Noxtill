import { Star } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

const MOCK_LATEST_REVIEW = {
  customerName: "Priya K.",
  stars: 5,
  text: "Best haircut in town! The staff were so friendly and my colour turned out perfect.",
  platform: "Google",
  createdAgo: "3 hours ago",
};

export function LatestReviewCard() {
  const review = MOCK_LATEST_REVIEW;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-fg-muted">Latest review</p>
        <span className="text-[11px] text-fg-faint">{review.createdAgo}</span>
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
      <p className="line-clamp-3 text-sm text-fg">&ldquo;{review.text}&rdquo;</p>
      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="text-xs text-fg-faint">
          {review.customerName} · {review.platform}
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
