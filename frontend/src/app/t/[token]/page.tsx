"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PublicVideoTestimonialFlow } from "@/components/public/public-video-testimonial-flow";
import { fetchPublicVideoTestimonial } from "@/lib/public-video-testimonial-api";
import { ApiError } from "@/lib/api-client";

export default function PublicVideoTestimonialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const {
    data: business,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["public-video-testimonial", token],
    queryFn: () => fetchPublicVideoTestimonial(token),
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

  return <PublicVideoTestimonialFlow token={token} business={business} />;
}
