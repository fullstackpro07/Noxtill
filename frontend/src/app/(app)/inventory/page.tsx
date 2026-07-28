"use client";

import { InventoryView } from "@/components/inventory/inventory-view";
import { useMockSession } from "@/lib/mock-session";

export default function InventoryPage() {
  const session = useMockSession();
  return <InventoryView currency={session.business.currency} />;
}
