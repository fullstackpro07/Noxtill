"use client";

import { OrdersView } from "@/components/orders/orders-view";
import { useMockSession } from "@/lib/mock-session";

export default function OrdersPage() {
  const session = useMockSession();
  return <OrdersView currency={session.business.currency} />;
}
