"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { WORKING_HOURS, appointmentOccupying, dateHourToIso } from "@/lib/bookings";
import { fetchStaff } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import { createWalkInAppointment, type LiveAppointment } from "@/lib/bookings-api";
import { searchCustomers, fetchCustomer, fetchDebtors } from "@/lib/customers-api";
import { joinQueue } from "@/lib/queue-api";
import { formatHour } from "@/lib/profit";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };
const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 800, color: "var(--app-text-muted)", flex: 1 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 800, color: "#fff", flex: 1 };

export function WalkInDialog({
  open,
  onClose,
  date,
  existingAppointments,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  existingAppointments: LiveAppointment[];
}) {
  return (
    <SlideDrawer open={open} onClose={onClose} title="Add Walk-in">
      {open && <WalkInBody key={date} onClose={onClose} date={date} existingAppointments={existingAppointments} />}
    </SlideDrawer>
  );
}

function WalkInBody({ onClose, date, existingAppointments }: { onClose: () => void; date: string; existingAppointments: LiveAppointment[] }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [phoneQuery, setPhoneQuery] = useState("");
  const [lookedUpId, setLookedUpId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [hour, setHour] = useState(WORKING_HOURS[0]);
  const [depositAmount, setDepositAmount] = useState("");

  const { data: services = [] } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service", active: true }) });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });
  const { data: debtors } = useQuery({ queryKey: ["credit-debtors"], queryFn: fetchDebtors });

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const matches = await searchCustomers(phoneQuery.trim());
      const exact = matches.find((m) => m.phone === phoneQuery.trim()) ?? matches[0];
      if (!exact) throw new Error("No customer found with that phone number.");
      return fetchCustomer(exact.id);
    },
    onSuccess: (customer) => {
      setLookedUpId(customer.id);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
    },
    onError: () => toast.error("No customer found with that phone number — create a new one below."),
  });

  const lookedUpBalance = lookedUpId ? (debtors ?? []).find((d) => d.customerId === lookedUpId)?.balance ?? 0 : 0;

  function startNewCustomer() {
    setLookedUpId(null);
    setCustomerName("");
    setCustomerPhone(phoneQuery);
  }

  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const requiredDeposit = service?.depositRequired ? service.depositAmount ?? 0 : 0;

  const createMutation = useMutation({
    mutationFn: () =>
      createWalkInAppointment({
        serviceId: service!.id,
        staffId: staffId || undefined,
        startsAt: dateHourToIso(date, hour),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        depositAmount: requiredDeposit > 0 ? Number(depositAmount) || 0 : undefined,
      }),
    onSuccess: (created) => {
      toast.success(`Walk-in booked for ${created.customerName}.`);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "That slot was just taken — pick a different time."
          : err instanceof ApiError
            ? err.message
            : "Couldn't book this walk-in — please try again.",
      );
    },
  });

  const queueMutation = useMutation({
    mutationFn: () => joinQueue({ customerName: customerName.trim() || "Guest", serviceId: service?.id }),
    onSuccess: (token) => {
      toast.success(`${token.customerName} added to the queue as #${token.number}.`);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this walk-in to the queue."),
  });

  const conflict = staffId ? appointmentOccupying(existingAppointments, staffId, hour) : undefined;
  const depositSatisfied = requiredDeposit <= 0 || Number(depositAmount) >= requiredDeposit;
  const canCreate = customerName.trim() !== "" && customerPhone.trim() !== "" && !!service && !conflict && depositSatisfied;

  return (
    <div className="flex flex-col gap-[13px]">
      <label className="block">
        <span style={fieldLabel}>PHONE LOOKUP — FASTEST</span>
        <span className="flex gap-2">
          <input value={phoneQuery} onChange={(e) => setPhoneQuery(e.target.value)} placeholder="03xx xxxxxxx" className="flex-1" style={{ ...fieldStyle, fontSize: 14 }} />
          <button type="button" onClick={() => lookupMutation.mutate()} disabled={!phoneQuery.trim() || lookupMutation.isPending} style={{ border: 0, background: "var(--app-sidebar-bg)", borderRadius: 11, padding: "12px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff" }}>
            {lookupMutation.isPending ? "…" : "Look up"}
          </button>
        </span>
      </label>

      {lookedUpId && (
        <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-primary)", background: "var(--app-page-bg,#F7FCF9)" }}>
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{customerName}</span>
            <span className="ms-auto rounded-full px-[9px] py-0.5 text-[11px] font-bold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>Existing</span>
          </span>
          <div className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
            {customerPhone} · {lookedUpBalance > 0 ? `owes ${formatCurrency(lookedUpBalance, session.business.currency)}` : "no outstanding credit"}
          </div>
        </div>
      )}

      <button type="button" onClick={startNewCustomer} className="text-start text-[12px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", borderRadius: 11, padding: "11px 14px", color: "var(--app-success-text)" }}>
        + New customer — create inline
      </button>

      <label className="block">
        <span style={fieldLabel}>CUSTOMER NAME</span>
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Or leave blank for Guest" style={fieldStyle} />
      </label>
      <label className="block">
        <span style={fieldLabel}>PHONE</span>
        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={fieldStyle} />
      </label>

      <label className="block">
        <span style={fieldLabel}>SERVICE</span>
        <select value={serviceId || services[0]?.id || ""} onChange={(e) => setServiceId(e.target.value)} style={fieldStyle}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes ?? 30}m)</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span style={fieldLabel}>STAFF</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={fieldStyle}>
            <option value="">Next available</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span style={fieldLabel}>TIME</span>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} style={fieldStyle}>
            {WORKING_HOURS.map((h) => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
        </label>
      </div>
      {conflict && <p className="m-0 text-[12px]" style={{ color: "var(--app-danger-strong)" }}>That staff member already has {conflict.customerName} at this time.</p>}

      {requiredDeposit > 0 && (
        <label className="block">
          <span style={fieldLabel}>DEPOSIT COLLECTED (CASH) — AT LEAST {formatCurrency(requiredDeposit, session.business.currency)}</span>
          <input type="number" min={0} step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} style={fieldStyle} />
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faintest)" }}>&quot;{service?.name}&quot; requires a deposit before it can be booked — collected in cash right now, since the customer is present.</p>
        </label>
      )}

      <div className="flex gap-2.5 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
        <button type="button" onClick={() => createMutation.mutate()} disabled={!canCreate || createMutation.isPending} style={{ ...primaryBtn, opacity: !canCreate || createMutation.isPending ? 0.6 : 1 }}>
          {createMutation.isPending ? "Booking…" : "Start Now"}
        </button>
        <button type="button" onClick={() => queueMutation.mutate()} disabled={!customerName.trim() || queueMutation.isPending} style={{ ...cancelBtn, opacity: !customerName.trim() || queueMutation.isPending ? 0.6 : 1 }}>
          {queueMutation.isPending ? "Adding…" : "Add to Queue"}
        </button>
      </div>
    </div>
  );
}
