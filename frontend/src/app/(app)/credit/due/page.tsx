"use client";

import { Suspense } from "react";
import { DueOverduePanel } from "@/components/credit/due-overdue-panel";

export default function CreditDuePage() {
  return (
    <Suspense>
      <DueOverduePanel />
    </Suspense>
  );
}
