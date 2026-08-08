"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { QuotationCard } from "./quotation-card";
import { fetchQuotations } from "@/lib/orders-api";

export function QuotationsPanel({ currency }: { currency: string }) {
  const {
    data: quotations = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["quotations"], queryFn: fetchQuotations });

  if (isError) {
    return <ErrorBanner title="Couldn't load quotations" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (quotations.length === 0) {
    return <EmptyState icon={FileText} title="No quotations yet" description="Quotes you send to customers will show up here." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {quotations.map((q) => (
        <QuotationCard key={q.id} quotation={q} currency={currency} />
      ))}
    </div>
  );
}
