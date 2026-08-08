"use client";

import { ProfitView } from "@/components/profit/profit-view";
import { useSession } from "@/lib/session";

export default function ProfitPage() {
  const session = useSession();
  return <ProfitView currency={session.business.currency} />;
}
