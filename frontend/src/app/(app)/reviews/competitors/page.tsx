"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CompetitorRatingsPanel } from "@/components/reviews/competitor-ratings-panel";

export default function CompetitorRatingsPage() {
  return (
    <SubscreenShell title="Competitor Ratings">
      <CompetitorRatingsPanel />
    </SubscreenShell>
  );
}
