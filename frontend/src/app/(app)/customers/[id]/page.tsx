"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CustomerProfileView } from "@/components/customers/customer-profile-view";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import { fetchCustomer } from "@/lib/customers-api";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();

  const {
    data: customer,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => fetchCustomer(id),
    retry: (failureCount, err) => !(err instanceof ApiError && err.status === 404) && failureCount < 2,
  });

  if (isError && error instanceof ApiError && error.status === 404) {
    notFound();
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner title="Couldn't load this customer" description="Check your connection and try again." onRetry={() => refetch()} />
      </div>
    );
  }

  return <CustomerProfileView customer={customer} currency={session.business.currency} />;
}
