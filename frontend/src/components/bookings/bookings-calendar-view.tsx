"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { DayGrid } from "./day-grid";
import { WeekSummary } from "./week-summary";
import { AppointmentStatusDrawer } from "./appointment-status-drawer";
import { WalkInDialog } from "./walk-in-dialog";
import { weekDates, appointmentOccupying, dateHourToIso, type AppointmentStatus } from "@/lib/bookings";
import { fetchAppointments, updateAppointmentStatus, rescheduleAppointment, type LiveAppointment } from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

type ViewMode = "day" | "week";

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingsCalendarView() {
  const [view, setView] = useState<ViewMode>("day");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<LiveAppointment | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [shakingId, setShakingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dates = weekDates(date);
  const from = new Date(`${dates[0]}T00:00:00`).toISOString();
  const to = new Date(`${dates[6]}T23:59:59.999`).toISOString();

  const {
    data: appointments = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["appointments", dates[0], dates[6]],
    queryFn: () => fetchAppointments({ from, to }),
  });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });

  const dayAppointments = appointments.filter((a) => a.date === date);

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startsAt, staffUserId }: { id: string; startsAt: string; staffUserId?: string }) =>
      rescheduleAppointment(id, { startsAt, staffUserId }),
    onError: (err, vars) => {
      setShakingId(vars.id);
      setTimeout(() => setShakingId(null), 400);
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "That slot was just taken."
          : "Couldn't reschedule this appointment.",
      );
    },
    onSuccess: (updated) => {
      toast.success(`${updated.customerName} rescheduled.`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => updateAppointmentStatus(id, status),
    onSuccess: (updated) => {
      toast.success(`Appointment marked ${updated.status.replace("_", " ")}.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update this appointment's status.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

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

    rescheduleMutation.mutate({ id: appointment.id, startsAt: dateHourToIso(date, hour), staffUserId: staffId });
  }

  function handleStatusChange(id: string, status: AppointmentStatus) {
    statusMutation.mutate({ id, status });
  }

  if (isError) {
    return <ErrorBanner title="Couldn't load bookings" description="Check your connection and try again." onRetry={() => refetch()} />;
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

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : view === "week" ? (
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
          <DayGrid appointments={dayAppointments} staff={staff} onSelect={setSelected} shakingId={shakingId} />
        </DndContext>
      )}

      <AppointmentStatusDrawer appointment={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />
      <WalkInDialog open={walkInOpen} onClose={() => setWalkInOpen(false)} date={date} existingAppointments={dayAppointments} />
    </div>
  );
}
