"use client";

import { SentimentThemesPanel } from "./sentiment-themes-panel";
import { ComplaintsTable } from "./complaints-table";

export function PrivateReviewsPanel({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-5">
      <SentimentThemesPanel />
      <ComplaintsTable currency={currency} />
    </div>
  );
}
