"use client";

import { Suspense } from "react";
import { CustomerCreditPanel } from "@/components/credit/customer-credit-panel";

export default function CreditCustomerPage() {
  return (
    <Suspense>
      <CustomerCreditPanel />
    </Suspense>
  );
}
