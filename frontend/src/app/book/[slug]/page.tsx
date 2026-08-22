"use client";

import { use, useEffect } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PublicBookingFlow } from "@/components/public/public-booking-flow";
import { fetchPublicBookingInfo, recordPublicBookingVisit } from "@/lib/public-booking-api";
import { ApiError } from "@/lib/api-client";

export default function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();

  useEffect(() => {
    recordPublicBookingVisit(slug, searchParams.get("src") === "qr" ? "qr" : "link").catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const {
    data: business,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["public-booking-info", slug],
    queryFn: () => fetchPublicBookingInfo(slug),
    retry: false,
  });

  if (isError && error instanceof ApiError && error.status === 404) {
    notFound();
  }

  if (isPending) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm items-center justify-center px-6">
        <div className="h-14 w-14 animate-pulse rounded-full bg-[#e4ddc9]" aria-hidden />
      </div>
    );
  }

  if (isError || !business) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-bold text-[#1c231e]">Something went wrong</h1>
        <p className="text-sm text-[#6b6353]">This link couldn&apos;t be loaded — please try again in a moment.</p>
      </div>
    );
  }

  return (
    <PublicBookingFlow
      slug={slug}
      businessName={business.businessName}
      welcomeText={business.welcomeText}
      brandColor={business.brandColor}
    />
  );
}
