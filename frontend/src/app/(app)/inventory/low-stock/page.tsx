"use client";

import { LowStockView } from "@/components/inventory/low-stock-view";
import { useSession } from "@/lib/session";

export default function LowStockPage() {
  const session = useSession();
  return <LowStockView currency={session.business.currency} />;
}
