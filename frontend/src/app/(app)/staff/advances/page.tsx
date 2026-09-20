"use client";

import { AdvancesView } from "@/components/staff/advances-view";
import { useSession } from "@/lib/session";

export default function StaffAdvancesPage() {
  const session = useSession();
  return <AdvancesView currency={session.business.currency} />;
}
