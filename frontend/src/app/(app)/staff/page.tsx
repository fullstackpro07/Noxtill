"use client";

import { StaffView } from "@/components/staff/staff-view";
import { useMockSession } from "@/lib/mock-session";

export default function StaffPage() {
  const session = useMockSession();
  return <StaffView currency={session.business.currency} role={session.user.role} />;
}
