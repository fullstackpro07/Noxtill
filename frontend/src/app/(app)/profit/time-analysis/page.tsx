"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { TimeAnalysisView } from "@/components/profit/time-analysis-view";
import { useSession } from "@/lib/session";

export default function TimeAnalysisPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Time Analysis" description="Peak hours, slowest windows, and an AI-drafted offer for your real dead hours.">
      <TimeAnalysisView currency={session.business.currency} />
    </SubscreenShell>
  );
}
