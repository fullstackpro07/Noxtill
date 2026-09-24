"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { bookingRef, callerName, fmtDateTime, type Tone } from "@/lib/receptionist-derive";
import { Card, ChipFor, EmptyState, Footnote, KpiCard, Notice, RowAction, SmallBtn, TableWrap, Th, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";

export function BookingsScreen() {
  return (
    <RxGate>
      <Bookings />
    </RxGate>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Awaiting approval", tone: "amber" },
  booked: { label: "Booked", tone: "green" },
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "No-show", tone: "red" },
};

function Bookings() {
  const router = useRouter();
  const { business } = useSession();
  const rx = useRx();
  const openCall = useRxStore((s) => s.openCall);
  const money = (n: number) => formatCurrency(n, business.currency, business.locale);

  const rows = rx.calls.filter((c) => c.appointment);
  const now = rx.now.getTime();
  const upcoming = rows.filter((c) => new Date(c.appointment!.startsAt).getTime() > now && ["requested", "booked", "confirmed"].includes(c.appointment!.status));
  const count = (s: string) => rows.filter((c) => c.appointment!.status === s).length;
  const deposits = rows.filter((c) => c.appointment!.depositPaid > 0);

  const kpis: { label: string; value: string; meta: string; tone: "neutral" | "green" | "amber" | "red" }[] = [
    { label: "Created by phone", value: String(rows.length), meta: "last 30 days", tone: "green" },
    { label: "Upcoming", value: String(upcoming.length), meta: "still to come", tone: "neutral" },
    { label: "Completed", value: String(count("completed")), meta: "appointment took place", tone: "neutral" },
    { label: "Cancelled", value: String(count("cancelled")), meta: "cancelled afterwards", tone: "neutral" },
    { label: "No-shows", value: String(count("no_show")), meta: "didn't attend", tone: count("no_show") ? "red" : "neutral" },
    { label: "Deposit recorded", value: String(deposits.length), meta: `of ${rows.length} phone booking${rows.length === 1 ? "" : "s"}`, tone: "neutral" },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(155)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.meta} tone={k.tone} />
        ))}
      </div>

      <Notice
        tone="green"
        icon="calendar-check"
        action={
          <SmallBtn icon="external-link" onClick={() => router.push("/bookings/appointments")}>
            Open Bookings
          </SmallBtn>
        }
      >
        Bookings the AI creates go through the same booking engine as your own: a time that isn&apos;t free is rejected and the caller is asked for another. Only successful bookings are recorded here — a failed attempt isn&apos;t logged on the call.
      </Notice>

      <Card overflow>
        {rows.length === 0 ? (
          <EmptyState icon="calendar-check" title="No bookings made by phone yet" body="When a caller books an appointment on a call, it appears here with the customer, service, time and current status." />
        ) : (
          <TableWrap
            minWidth={1080}
            head={
              <>
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Service</Th>
                <Th>When</Th>
                <Th>Staff</Th>
                <Th>Deposit</Th>
                <Th>Created by</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </>
            }
          >
            {rows.map((c) => {
              const a = c.appointment!;
              const st = STATUS[a.status] ?? { label: a.status, tone: "neutral" as Tone };
              return (
                <tr key={c.id} onClick={() => openCall(c.id, "Booking")} className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!" style={{ background: st.tone === "amber" ? "#FFFDF5" : st.tone === "red" ? "#FEFBFB" : "#fff" }}>
                  <td className="py-[11px] pl-[18px] pr-3 font-mono text-[12px] font-bold">{bookingRef(a)}</td>
                  <td className="px-3 py-[11px] text-[12px] font-bold">{a.customerName || callerName(c)}</td>
                  <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{a.serviceName}</td>
                  <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{fmtDateTime(a.startsAt, rx.timezone)}</td>
                  <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{a.staffName ?? "Not assigned"}</td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={{ label: a.depositPaid > 0 ? `${money(a.depositPaid)} paid` : "None recorded", tone: a.depositPaid > 0 ? "green" : "neutral" }} />
                  </td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={{ label: "AI", tone: "purple", icon: "sparkles" }} />
                  </td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={st} />
                  </td>
                  <td className="py-[11px] pl-3 pr-[18px] text-right">
                    <RowAction onClick={(e) => { e.stopPropagation(); openCall(c.id, "Booking"); }}>Open</RowAction>
                  </td>
                </tr>
              );
            })}
          </TableWrap>
        )}
        <Footnote>Bookings owns these records — this is the phone-created subset, with each appointment&apos;s live status. Opening a row shows the call that created it.</Footnote>
      </Card>
    </div>
  );
}
