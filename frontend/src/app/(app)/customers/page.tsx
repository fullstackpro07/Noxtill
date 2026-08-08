"use client";

import { CustomersView } from "@/components/customers/customers-view";
import { useSession } from "@/lib/session";

export default function CustomersPage() {
  const session = useSession();
  return <CustomersView currency={session.business.currency} />;
}
