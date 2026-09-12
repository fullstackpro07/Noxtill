"use client";

import { ComplaintsTable } from "./complaints-table";
import { SentimentThemesPanel } from "./sentiment-themes-panel";

export function PrivateReviewsPanel({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-5">
      <SentimentThemesPanel source="private_feedback" />
      <ComplaintsTable currency={currency} />
    </div>
  );
}
