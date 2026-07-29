"use client";

import { MarketingView } from "@/components/marketing/marketing-view";
import { useMockSession } from "@/lib/mock-session";

export default function MarketingPage() {
  const session = useMockSession();
  return <MarketingView currency={session.business.currency} />;
}
