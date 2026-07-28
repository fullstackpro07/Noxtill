"use client";

import { ProfitView } from "@/components/profit/profit-view";
import { useMockSession } from "@/lib/mock-session";

export default function ProfitPage() {
  const session = useMockSession();
  return <ProfitView currency={session.business.currency} />;
}
