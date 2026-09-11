"use client";

import { use } from "react";
import { ConnectionDetailView } from "@/components/integrations/connection-detail-view";

export default function ConnectionDetailPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = use(params);
  return <ConnectionDetailView provider={provider} />;
}
