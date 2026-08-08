"use client";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const session = useSession();
  return <DashboardView currency={session.business.currency} businessName={session.business.name} />;
}
