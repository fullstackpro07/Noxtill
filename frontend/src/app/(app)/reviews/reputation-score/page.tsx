"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReputationScorePanel } from "@/components/reviews/reputation-score-panel";

export default function ReputationScorePage() {
  return (
    <SubscreenShell title="Reputation Score">
      <ReputationScorePanel />
    </SubscreenShell>
  );
}
