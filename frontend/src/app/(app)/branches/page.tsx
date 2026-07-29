"use client";

import { BranchesView } from "@/components/branches/branches-view";
import { useMockSession } from "@/lib/mock-session";

export default function BranchesPage() {
  const session = useMockSession();
  return <BranchesView currency={session.business.currency} />;
}
