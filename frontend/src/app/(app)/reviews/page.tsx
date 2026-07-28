"use client";

import { ReviewsView } from "@/components/reviews/reviews-view";
import { useMockSession } from "@/lib/mock-session";

export default function ReviewsPage() {
  const session = useMockSession();
  return (
    <ReviewsView
      currency={session.business.currency}
      businessName={session.business.name}
      businessSlug={session.business.slug}
    />
  );
}
