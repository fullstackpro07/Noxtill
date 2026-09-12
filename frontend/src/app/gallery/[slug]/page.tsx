"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchVideoTestimonialGallery } from "@/lib/video-testimonials-api";
import { ApiError } from "@/lib/api-client";

export default function VideoTestimonialGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["video-gallery", slug],
    queryFn: () => fetchVideoTestimonialGallery(slug),
    retry: false,
  });

  if (isError && error instanceof ApiError && error.status === 404) {
    notFound();
  }

  if (isPending) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center px-6">
        <div className="h-14 w-14 animate-pulse rounded-full bg-[#e4ddc9]" aria-hidden />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-bold text-[#1c231e]">Something went wrong</h1>
        <p className="text-sm text-[#6b6353]">This gallery couldn&apos;t be loaded — please try again in a moment.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#1c231e]">What {data.businessName}&apos;s customers say</h1>
      {data.testimonials.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#6b6353]">No video testimonials yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {data.testimonials.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-[#e6dcc6] bg-white">
              <video src={t.videoUrl} controls className="aspect-video w-full bg-black object-cover" />
              <div className="p-4">
                {t.customerName && <p className="text-sm font-medium text-[#1c231e]">{t.customerName}</p>}
                {t.caption && <p className="mt-1 text-sm text-[#6b6353]">{t.caption}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
