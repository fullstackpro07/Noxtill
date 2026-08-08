"use client";

import { OrdersView } from "@/components/orders/orders-view";
import { useSession } from "@/lib/session";

export default function OrdersPage() {
  const session = useSession();
  return <OrdersView currency={session.business.currency} businessName={session.business.name} />;
}
