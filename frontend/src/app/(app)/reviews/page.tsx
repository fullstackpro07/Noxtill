"use client";

import { ReviewsInboxView } from "@/components/reviews/reviews-inbox-view";
import { SentimentThemesPanel } from "@/components/reviews/sentiment-themes-panel";

export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Reviews</h1>
      </div>
      <div className="mb-5">
        <SentimentThemesPanel />
      </div>
      <ReviewsInboxView />
    </div>
  );
}
