"use client";

import { Suspense } from "react";
import { AllCustomersPanel } from "@/components/customers/all-customers-panel";

export default function CustomersPage() {
  return (
    <Suspense>
      <AllCustomersPanel />
    </Suspense>
  );
}
