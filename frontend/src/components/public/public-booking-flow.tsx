"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchPublicServices,
  fetchPublicSlots,
  createPublicBooking,
  type PublicService,
} from "@/lib/public-booking-api";
import { formatDate, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";

function nextDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

const DATES = nextDates(7);

type Step = 1 | 2 | 3;

export function PublicBookingFlow({
  slug,
  businessName,
  welcomeText,
  brandColor,
}: {
  slug: string;
  businessName: string;
  welcomeText?: string | null;
  brandColor?: string | null;
}) {
  const brand = brandColor || "#0c4b3b";
  const [step, setStep] = useState<Step>(1);
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState(DATES[0]);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["public-services", slug],
    queryFn: () => fetchPublicServices(slug),
  });

  const {
    data: slotsData,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ["public-slots", slug, service?.id, date],
    queryFn: () => fetchPublicSlots(slug, { service: service!.id, date }),
    enabled: !!service,
  });
  const slots = slotsData?.slots ?? [];

  const bookMutation = useMutation({
    mutationFn: () =>
      createPublicBooking(slug, {
        serviceId: service!.id,
        startsAt: slot!,
        customerName: name.trim(),
        customerPhone: phone.trim(),
      }),
    onSuccess: () => setConfirmed(true),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflictMessage("That time was just taken by another customer — please pick a different time.");
        setSlot(null);
        setStep(2);
        refetchSlots();
      } else {
        setConflictMessage("Something went wrong — please try again.");
      }
    },
  });

  function selectService(s: PublicService) {
    setService(s);
    setSlot(null);
    setStep(2);
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    bookMutation.mutate();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-5 px-6 py-8">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full font-bold text-[#faf7f0]" style={{ background: brand }}>
          {businessName.slice(0, 1)}
        </div>
        <h1 className="text-lg font-bold text-[#1c231e]">Book with {businessName}</h1>
        {welcomeText && <p className="mt-1 text-sm text-[#6b6353]">{welcomeText}</p>}
      </div>

      {confirmed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h2 className="text-xl font-bold text-[#1c231e]">You&apos;re booked!</h2>
          <p className="text-sm text-[#6b6353]">
            {service?.name} on {formatDate(date)} at {slot ? formatTime(slot) : ""}.
          </p>
          <p className="text-sm text-[#6b6353]">A confirmation was sent to {phone}.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className="h-1.5 w-8 rounded-full"
                style={{ background: n <= step ? brand : "#e6dcc6" }}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[#1c231e]">Choose a service</p>
              {services.length === 0 && <p className="text-sm text-[#a89f8b]">No services available right now.</p>}
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectService(s)}
                  className="flex items-center justify-between rounded-xl border border-[#e6dcc6] bg-white px-4 py-3 text-start"
                >
                  <span>
                    <span className="block text-sm font-medium text-[#1c231e]">{s.name}</span>
                    <span className="block text-xs text-[#a89f8b]">{s.durationMin ?? 30} min</span>
                  </span>
                  <span className="text-sm font-bold text-[#0c4b3b]">${Number(s.sellingPrice)}</span>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {conflictMessage && (
                <p className="rounded-xl bg-[#b94a3d]/10 px-3.5 py-2.5 text-sm text-[#b94a3d]">{conflictMessage}</p>
              )}

              <div>
                <p className="mb-1.5 text-sm font-medium text-[#1c231e]">Date</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {DATES.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setDate(d);
                        setSlot(null);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${date === d ? "border-[#0c4b3b] bg-[#0c4b3b]/8 text-[#0c4b3b]" : "border-[#e6dcc6] text-[#6b6353]"}`}
                    >
                      {formatDate(d).slice(0, 6)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-[#1c231e]">Time</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.length === 0 ? (
                    <p className="col-span-4 text-sm text-[#a89f8b]">No times available this day.</p>
                  ) : (
                    slots.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlot(s)}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium ${slot === s ? "border-[#0c4b3b] bg-[#0c4b3b] text-[#faf7f0]" : "border-[#e6dcc6] text-[#6b6353]"}`}
                      >
                        {formatTime(s)}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={slot === null}
                className="w-full rounded-full px-5 py-3 text-sm font-medium text-[#faf7f0] disabled:opacity-40"
                style={{ background: brand }}
              >
                Continue
              </button>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleConfirm} className="flex flex-col gap-3">
              <div className="rounded-xl bg-[#f2ecdd] px-3.5 py-2.5 text-sm text-[#1c231e]">
                {service?.name} · {formatDate(date)} · {slot ? formatTime(slot) : ""}
              </div>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-[#d8caa8] bg-white px-3.5 py-2.5 text-sm text-[#1c231e] focus:border-[#0c4b3b] focus:outline-none"
              />
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full rounded-xl border border-[#d8caa8] bg-white px-3.5 py-2.5 text-sm text-[#1c231e] focus:border-[#0c4b3b] focus:outline-none"
              />
              <button
                type="submit"
                disabled={bookMutation.isPending}
                className="w-full rounded-full px-5 py-3 text-sm font-medium text-[#faf7f0] disabled:opacity-60"
                style={{ background: brand }}
              >
                {bookMutation.isPending ? "Booking…" : "Confirm booking"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
