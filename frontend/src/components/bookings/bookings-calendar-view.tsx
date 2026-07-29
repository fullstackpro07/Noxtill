"use client";

import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DayGrid } from "./day-grid";
import { WeekSummary } from "./week-summary";
import { AppointmentStatusDrawer } from "./appointment-status-drawer";
import { WalkInDialog } from "./walk-in-dialog";
import { APPOINTMENTS, TODAY, appointmentOccupying, type Appointment, type AppointmentStatus } from "@/lib/bookings";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

type ViewMode = "day" | "week";

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingsCalendarView() {
  const [view, setView] = useState<ViewMode>("day");
  const [date, setDate] = useState(TODAY);
  const [appointments, setAppointments] = useState<Appointment[]>(APPOINTMENTS);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [shakingId, setShakingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dayAppointments = appointments.filter((a) => a.date === date);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const [staffId, hourStr] = String(over.id).split(":");
    const hour = Number(hourStr);
    const appointment = appointments.find((a) => a.id === active.id);
    if (!appointment) return;
    if (appointment.staffId === staffId && appointment.startHour === hour) return;

    const conflict = appointmentOccupying(dayAppointments, staffId, hour, appointment.id);
    if (conflict) {
      setShakingId(appointment.id);
      toast.error(`That slot is taken by ${conflict.customerName}.`);
      setTimeout(() => setShakingId(null), 400);
      return;
    }

    setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, staffId, startHour: hour } : a)));
    toast.success(`${appointment.customerName} rescheduled. Live update wires up in INT-008.`);
  }

  function handleStatusChange(id: string, status: AppointmentStatus) {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  function handleCreate(appointment: Appointment) {
    setAppointments((prev) => [...prev, appointment]);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Bookings</h1>
        <div className="flex items-center gap-2">
          <Tabs
            items={[
              { key: "day", label: "Day" },
              { key: "week", label: "Week" },
            ]}
            value={view}
            onChange={(k) => setView(k as ViewMode)}
            className="w-40"
          />
          <Button size="sm" onClick={() => setWalkInOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Walk-in
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-center gap-3">
        <button
          onClick={() => setDate((d) => shiftDate(d, view === "day" ? -1 : -7))}
          aria-label="Previous"
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-medium text-fg">{formatDate(date)}</p>
        <button
          onClick={() => setDate((d) => shiftDate(d, view === "day" ? 1 : 7))}
          aria-label="Next"
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {view === "week" ? (
        <WeekSummary
          anchor={date}
          appointments={appointments}
          onSelectDate={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <DayGrid appointments={dayAppointments} onSelect={setSelected} shakingId={shakingId} />
        </DndContext>
      )}

      <AppointmentStatusDrawer appointment={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />
      <WalkInDialog
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        date={date}
        existingAppointments={dayAppointments}
        onCreate={handleCreate}
      />
    </div>
  );
}
