"use client";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { useMockSession } from "@/lib/mock-session";

export default function DashboardPage() {
  const session = useMockSession();
  return <DashboardView currency={session.business.currency} businessName={session.business.name} />;
}
