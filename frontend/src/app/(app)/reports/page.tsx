"use client";

import { ReportsView } from "@/components/reports/reports-view";
import { useSession } from "@/lib/session";

export default function ReportsPage() {
  const session = useSession();
  return <ReportsView role={session.user.role} />;
}
