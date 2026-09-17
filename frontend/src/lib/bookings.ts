export type AppointmentStatus = "requested" | "booked" | "confirmed" | "completed" | "cancelled" | "no_show";

/** Salon open hours, one slot per hour — 9am through the 6pm start (last appointment ends by 7pm). */
export const WORKING_HOURS = Array.from({ length: 10 }, (_, i) => 9 + i);

/** Mirrors the backend's flow guard (BE-054 APPOINTMENT_STATUS_TRANSITIONS) so the UI can pre-validate before the server round-trip. */
const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ["confirmed", "cancelled"],
  booked: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_STATUS_TRANSITIONS[from].includes(to);
}

interface OccupyingCheck {
  id: string;
  staffId?: string;
  startHour: number;
  durationHours: number;
}

export function appointmentOccupying<T extends OccupyingCheck>(appointments: T[], staffId: string, hour: number, excludeId?: string): T | undefined {
  return appointments.find(
    (a) => a.id !== excludeId && a.staffId === staffId && hour >= a.startHour && hour < a.startHour + a.durationHours,
  );
}

/** Combines a "YYYY-MM-DD" date with a whole/half hour into a real local-time ISO instant. */
export function dateHourToIso(date: string, hour: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const wholeHour = Math.floor(hour);
  const minutes = Math.round((hour - wholeHour) * 60);
  return new Date(y, m - 1, d, wholeHour, minutes).toISOString();
}

export function weekDates(anchor: string): string[] {
  const start = new Date(anchor);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
