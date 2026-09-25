"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicTracking, type PublicTracking } from "@/lib/public-tracking-api";
import { ApiError } from "@/lib/api-client";

const STEPS: { key: PublicTracking["status"][]; label: string }[] = [
  { key: ["unassigned"], label: "Order received" },
  { key: ["assigned"], label: "Rider assigned" },
  { key: ["picked_up"], label: "Picked up" },
  { key: ["en_route"], label: "On the way" },
  { key: ["delivered"], label: "Delivered" },
];

function time(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

export default function PublicTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["public-tracking", token],
    queryFn: () => fetchPublicTracking(token),
    retry: false,
    refetchInterval: 30000,
  });

  if (isError && error instanceof ApiError && error.status === 404) notFound();

  if (isPending) return <div className="mx-auto flex min-h-dvh max-w-sm items-center justify-center px-6 text-sm text-[#6b6353]">Loading your delivery…</div>;
  if (isError || !data) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-bold text-[#1c231e]">Something went wrong</h1>
        <p className="text-sm text-[#6b6353]">This link couldn&apos;t be loaded. Please try again in a moment.</p>
      </div>
    );
  }

  const current = data.status === "failed" ? -1 : STEPS.findIndex((s) => s.key.includes(data.status));

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 py-8" style={{ fontFamily: "system-ui, sans-serif" }}>
      <p className="text-xs font-bold uppercase tracking-wide text-[#6b6353]">{data.businessName}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-[#1c231e]">Order {data.code}</h1>
      <p className="mt-1 text-sm text-[#6b6353]">{data.address}</p>

      {data.status === "failed" ? (
        <div className="mt-5 rounded-xl border border-[#FDD9D6] bg-[#FEF3F2] p-4 text-sm text-[#B42318]">
          We couldn&apos;t complete this delivery{data.failureReason ? `: ${data.failureReason}` : ""}. {data.businessName} will be in touch.
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-[#E6EAF0] bg-white p-4">
          {data.status === "delivered" ? (
            <p className="text-sm font-bold text-[#0E8442]">Delivered{data.deliveredAt ? ` at ${time(data.deliveredAt)}` : ""}</p>
          ) : data.promisedAt ? (
            <p className="text-sm font-bold text-[#1c231e]">Expected by {time(data.promisedAt)}</p>
          ) : (
            <p className="text-sm font-bold text-[#1c231e]">We&apos;ll confirm a time once a rider is assigned.</p>
          )}
          {data.riderFirstName && data.status !== "delivered" && <p className="mt-1 text-xs text-[#6b6353]">Your rider is {data.riderFirstName}.</p>}
          <ol className="mt-4 flex flex-col gap-2">
            {STEPS.map((step, i) => (
              <li key={step.label} className="flex items-center gap-3 text-sm" style={{ color: i <= current ? "#0E8442" : "#98A2B3", fontWeight: i === current ? 800 : 500 }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i <= current ? "#12A150" : "#D5DCE4" }} />
                {step.label}
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.position && (
        <a
          className="mt-4 block rounded-xl border border-[#E6EAF0] bg-white p-4 text-sm font-bold text-[#0E8442]"
          href={`https://www.openstreetmap.org/?mlat=${data.position.lat}&mlon=${data.position.lng}#map=16/${data.position.lat}/${data.position.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          See your rider on the map (last seen {data.position.minutesAgo} min ago)
        </a>
      )}

      {data.proof && (data.proof.signatureUrl || data.proof.photoUrl) && (
        <div className="mt-4 rounded-xl border border-[#E6EAF0] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#6b6353]">Proof of delivery</p>
          <div className="mt-2 flex gap-3">
            {data.proof.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.proof.signatureUrl} alt="Signature" className="h-20 rounded border border-[#E6EAF0] bg-white" />
            )}
            {data.proof.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.proof.photoUrl} alt="Delivery photo" className="h-20 w-20 rounded border border-[#E6EAF0] object-cover" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
