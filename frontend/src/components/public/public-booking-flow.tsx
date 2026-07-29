"use client";

import { useState } from "react";
import { PRODUCTS, type Product } from "@/lib/products";
import { STAFF } from "@/lib/staff";
import { nextDates, availableHours } from "@/lib/public-booking";
import { formatHour } from "@/lib/profit";
import { formatDate } from "@/lib/format";

const SERVICES = PRODUCTS.filter((p) => p.kind === "service" && p.active);
const DATES = nextDates(7);

type Step = 1 | 2 | 3;

export function PublicBookingFlow({ businessName }: { businessName: string }) {
  const [step, setStep] = useState<Step>(1);
  const [service, setService] = useState<Product | null>(null);
  const [staffId, setStaffId] = useState("any");
  const [date, setDate] = useState(DATES[0]);
  const [hour, setHour] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [takenOverrides, setTakenOverrides] = useState<Set<string>>(new Set());
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const hours = availableHours(date, staffId, takenOverrides);

  function selectService(s: Product) {
    setService(s);
    setStep(2);
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (hour === null) return;

    // The earliest-shown slot simulates a race loss — someone else grabbed it between selection and confirm.
    if (hour === hours[0]) {
      setTakenOverrides((prev) => new Set(prev).add(`${staffId}:${date}:${hour}`));
      setConflictMessage(`${formatHour(hour)} was just taken by another customer — please pick a different time.`);
      setHour(null);
      setStep(2);
      return;
    }

    setConfirmed(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col gap-5 px-6 py-8">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#0c4b3b] font-bold text-[#faf7f0]">
          {businessName.slice(0, 1)}
        </div>
        <h1 className="text-lg font-bold text-[#1c231e]">Book with {businessName}</h1>
      </div>

      {confirmed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h2 className="text-xl font-bold text-[#1c231e]">You&apos;re booked!</h2>
          <p className="text-sm text-[#6b6353]">
            {service?.name} on {formatDate(date)} at {hour !== null ? formatHour(hour) : ""}.
          </p>
          <p className="text-sm text-[#6b6353]">A confirmation was sent to {phone}.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-8 rounded-full ${n <= step ? "bg-[#0c4b3b]" : "bg-[#e6dcc6]"}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[#1c231e]">Choose a service</p>
              {SERVICES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectService(s)}
                  className="flex items-center justify-between rounded-xl border border-[#e6dcc6] bg-white px-4 py-3 text-start"
                >
                  <span>
                    <span className="block text-sm font-medium text-[#1c231e]">{s.name}</span>
                    <span className="block text-xs text-[#a89f8b]">{s.durationMinutes} min</span>
                  </span>
                  <span className="text-sm font-bold text-[#0c4b3b]">${s.price}</span>
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
                <p className="mb-1.5 text-sm font-medium text-[#1c231e]">Staff</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      setStaffId("any");
                      setHour(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${staffId === "any" ? "border-[#0c4b3b] bg-[#0c4b3b]/8 text-[#0c4b3b]" : "border-[#e6dcc6] text-[#6b6353]"}`}
                  >
                    Any available
                  </button>
                  {STAFF.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setStaffId(s.id);
                        setHour(null);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${staffId === s.id ? "border-[#0c4b3b] bg-[#0c4b3b]/8 text-[#0c4b3b]" : "border-[#e6dcc6] text-[#6b6353]"}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-[#1c231e]">Date</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {DATES.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setDate(d);
                        setHour(null);
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
                  {hours.length === 0 ? (
                    <p className="col-span-4 text-sm text-[#a89f8b]">No times available this day.</p>
                  ) : (
                    hours.map((h) => (
                      <button
                        key={h}
                        onClick={() => setHour(h)}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium ${hour === h ? "border-[#0c4b3b] bg-[#0c4b3b] text-[#faf7f0]" : "border-[#e6dcc6] text-[#6b6353]"}`}
                      >
                        {formatHour(h)}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={hour === null}
                className="w-full rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0] disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleConfirm} className="flex flex-col gap-3">
              <div className="rounded-xl bg-[#f2ecdd] px-3.5 py-2.5 text-sm text-[#1c231e]">
                {service?.name} · {formatDate(date)} · {hour !== null ? formatHour(hour) : ""}
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
                className="w-full rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0]"
              >
                Confirm booking
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
