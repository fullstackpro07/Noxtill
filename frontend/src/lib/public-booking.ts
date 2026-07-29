import { WORKING_HOURS, appointmentsForDate, appointmentOccupying, TODAY } from "@/lib/bookings";
import { STAFF } from "@/lib/staff";

export function nextDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** staffId "any" checks whether at least one staff member is free at that hour. */
export function availableHours(date: string, staffId: string, takenOverrides: Set<string> = new Set()): number[] {
  const dayAppointments = appointmentsForDate(date);
  return WORKING_HOURS.filter((hour) => {
    if (takenOverrides.has(`${staffId}:${date}:${hour}`)) return false;
    if (staffId === "any") return STAFF.some((s) => !appointmentOccupying(dayAppointments, s.id, hour));
    return !appointmentOccupying(dayAppointments, staffId, hour);
  });
}
