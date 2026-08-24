"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { PrivateReviewsPanel } from "@/components/reviews/private-reviews-panel";
import { useSession } from "@/lib/session";

export default function ReviewsComplaintsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Private Reviews">
      <PrivateReviewsPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}
