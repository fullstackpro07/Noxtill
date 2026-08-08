"use client";

import { InventoryView } from "@/components/inventory/inventory-view";
import { useSession } from "@/lib/session";

export default function InventoryPage() {
  const session = useSession();
  return <InventoryView currency={session.business.currency} />;
}
