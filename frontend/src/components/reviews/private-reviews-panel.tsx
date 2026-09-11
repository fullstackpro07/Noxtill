"use client";

import { ComplaintsTable } from "./complaints-table";

export function PrivateReviewsPanel({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-5">
      <ComplaintsTable currency={currency} />
    </div>
  );
}
