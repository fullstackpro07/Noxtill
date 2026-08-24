"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { RatingQrPanel } from "@/components/reviews/rating-qr-panel";
import { useSession } from "@/lib/session";

export default function ReviewsQrPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Rating Page & QR">
      <RatingQrPanel businessName={session.business.name} businessSlug={session.business.slug} />
    </SubscreenShell>
  );
}
