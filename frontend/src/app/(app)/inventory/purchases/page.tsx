"use client";

import { PurchasesView } from "@/components/inventory/purchases-view";
import { useSession } from "@/lib/session";

export default function PurchasesPage() {
  const session = useSession();
  return <PurchasesView currency={session.business.currency} />;
}
