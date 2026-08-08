"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mintReviewQrLink } from "@/lib/public-review-api";
import { ApiError } from "@/lib/api-client";

/** The stable URL a printed/embedded QR code encodes — mints a fresh single-use review token on each scan, then hands off to the normal `/r/:token` flow. */
export default function ReviewQrEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    mintReviewQrLink(slug)
      .then(({ token }) => {
        router.replace(`/r/${token}`);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setError("This review link isn't valid.");
        } else if (err instanceof ApiError && err.status === 429) {
          setError("This code has been scanned a lot in the last minute — please try again shortly.");
        } else {
          setError("Something went wrong — please try scanning again in a moment.");
        }
      });
  }, [slug, router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Couldn&apos;t open this link</h1>
          <p className="text-sm text-[#6b6353]">{error}</p>
        </>
      ) : (
        <div className="h-14 w-14 animate-pulse rounded-full bg-[#e4ddc9]" aria-hidden />
      )}
    </div>
  );
}
