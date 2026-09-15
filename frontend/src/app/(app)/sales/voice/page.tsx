"use client";

import { VoiceSaleView } from "@/components/pos/voice-sale-view";
import { useSession } from "@/lib/session";

export default function SalesVoicePage() {
  const session = useSession();
  return <VoiceSaleView currency={session.business.currency} />;
}
