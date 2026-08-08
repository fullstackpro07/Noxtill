"use client";

import { CreditView } from "@/components/credit/credit-view";
import { useSession } from "@/lib/session";

export default function CreditPage() {
  const session = useSession();
  return <CreditView currency={session.business.currency} />;
}
