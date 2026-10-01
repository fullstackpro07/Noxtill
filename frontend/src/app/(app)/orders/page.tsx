"use client";

import { Suspense } from "react";
import { AllOrdersView } from "@/components/orders/all-orders-view";

export default function OrdersPage() {
  return (
    <Suspense>
      <AllOrdersView />
    </Suspense>
  );
}
