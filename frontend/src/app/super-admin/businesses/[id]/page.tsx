"use client";

import { Suspense, use } from "react";
import { BusinessDetailView } from "@/components/super-admin/views/business-detail-view";

export default function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <BusinessDetailView id={id} />
    </Suspense>
  );
}
