"use client";

import { SalesView } from "@/components/pos/sales-view";
import { useSession } from "@/lib/session";

export default function SalesPage() {
  const session = useSession();
  return <SalesView currency={session.business.currency} />;
}
