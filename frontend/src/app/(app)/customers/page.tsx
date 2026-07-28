"use client";

import { CustomersView } from "@/components/customers/customers-view";
import { useMockSession } from "@/lib/mock-session";

export default function CustomersPage() {
  const session = useMockSession();
  return <CustomersView currency={session.business.currency} />;
}
