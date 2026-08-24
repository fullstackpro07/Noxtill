"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReviewRequestsPanel } from "@/components/reviews/review-requests-panel";

export default function ReviewRequestsPage() {
  return (
    <SubscreenShell title="Review Requests">
      <ReviewRequestsPanel />
    </SubscreenShell>
  );
}
