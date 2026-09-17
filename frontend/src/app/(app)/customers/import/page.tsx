"use client";

import { ImportCustomersPanel } from "@/components/customers/import-customers-panel";
import { useSession } from "@/lib/session";

export default function CustomerImportPage() {
  const session = useSession();
  return <ImportCustomersPanel currency={session.business.currency} />;
}
