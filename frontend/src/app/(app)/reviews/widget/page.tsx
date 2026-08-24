"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ReviewWidgetPanel } from "@/components/reviews/review-widget-panel";
import { useSession } from "@/lib/session";

export default function ReviewsWidgetPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Review Widget">
      <ReviewWidgetPanel businessSlug={session.business.slug} />
    </SubscreenShell>
  );
}
