"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReviewSettingsPanel } from "@/components/reviews/review-settings-panel";

export default function ReviewSettingsPage() {
  return (
    <SubscreenShell title="Review Settings">
      <ReviewSettingsPanel />
    </SubscreenShell>
  );
}
