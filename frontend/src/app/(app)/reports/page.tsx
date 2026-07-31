"use client";

import { ReportsView } from "@/components/reports/reports-view";
import { useMockSession } from "@/lib/mock-session";

export default function ReportsPage() {
  const session = useMockSession();
  return <ReportsView role={session.user.role} />;
}
