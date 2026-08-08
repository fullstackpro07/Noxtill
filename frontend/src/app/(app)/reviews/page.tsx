"use client";

import { ReviewsView } from "@/components/reviews/reviews-view";
import { useSession } from "@/lib/session";

export default function ReviewsPage() {
  const session = useSession();
  return (
    <ReviewsView
      currency={session.business.currency}
      businessName={session.business.name}
      businessSlug={session.business.slug}
    />
  );
}
