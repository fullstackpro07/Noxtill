"use client";

import { StaffView } from "@/components/staff/staff-view";
import { useSession } from "@/lib/session";

export default function StaffPage() {
  const session = useSession();
  return <StaffView currency={session.business.currency} role={session.user.role} />;
}
