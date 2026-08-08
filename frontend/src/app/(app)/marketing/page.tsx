"use client";

import { MarketingView } from "@/components/marketing/marketing-view";
import { useSession } from "@/lib/session";

export default function MarketingPage() {
  const session = useSession();
  return <MarketingView currency={session.business.currency} />;
}
