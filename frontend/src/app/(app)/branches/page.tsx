"use client";

import { BranchesView } from "@/components/branches/branches-view";
import { useSession } from "@/lib/session";

export default function BranchesPage() {
  const session = useSession();
  return <BranchesView currency={session.business.currency} />;
}
