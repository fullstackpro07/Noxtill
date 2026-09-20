"use client";

import { StockMovementsView } from "@/components/inventory/stock-movements-view";
import { useSession } from "@/lib/session";

export default function StockMovementsPage() {
  const session = useSession();
  return <StockMovementsView currency={session.business.currency} />;
}
