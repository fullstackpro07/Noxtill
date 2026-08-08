"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { unsubscribeEmail } from "@/lib/email-marketing-api";
import { ApiError } from "@/lib/api-client";

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeBody />
    </Suspense>
  );
}

function UnsubscribeBody() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const { isPending, isError, error } = useQuery({
    queryKey: ["unsubscribe", token],
    queryFn: () => unsubscribeEmail(token),
    enabled: !!token,
    retry: false,
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      {!token ? (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Invalid link</h1>
          <p className="text-sm text-[#6b6353]">This unsubscribe link is missing its token.</p>
        </>
      ) : isPending ? (
        <div className="h-14 w-14 animate-pulse rounded-full bg-[#e4ddc9]" aria-hidden />
      ) : isError ? (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">This link isn&apos;t valid</h1>
          <p className="text-sm text-[#6b6353]">
            {error instanceof ApiError ? error.message : "Please try again from a more recent email."}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">You&apos;re unsubscribed</h1>
          <p className="text-sm text-[#6b6353]">You won&apos;t receive marketing emails from this business again.</p>
        </>
      )}
    </div>
  );
}
