"use client";

import { CreditView } from "@/components/credit/credit-view";
import { useMockSession } from "@/lib/mock-session";

export default function CreditPage() {
  const session = useMockSession();
  return <CreditView currency={session.business.currency} />;
}
