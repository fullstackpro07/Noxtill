export type AppointmentStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  staffId: string;
  customerName: string;
  serviceName: string;
  date: string;
  startHour: number;
  durationHours: number;
  status: AppointmentStatus;
}

/** Salon open hours, one slot per hour — 9am through the 6pm start (last appointment ends by 7pm). */
export const WORKING_HOURS = Array.from({ length: 10 }, (_, i) => 9 + i);

export const TODAY = "2026-07-29";

const ILLEGAL_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  confirmed: [],
  completed: ["confirmed", "cancelled", "no_show"],
  cancelled: ["confirmed", "completed", "no_show"],
  no_show: ["confirmed", "completed", "cancelled"],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return false;
  return !ILLEGAL_STATUS_TRANSITIONS[from].includes(to);
}

/** Mock appointment book — real slot-lock booking + status flow is BE-052/053/054, live wiring is INT-008. */
export const APPOINTMENTS: Appointment[] = [
  { id: "a1", staffId: "s1", customerName: "Casey Nolan", serviceName: "Signature Haircut", date: TODAY, startHour: 9, durationHours: 1, status: "completed" },
  { id: "a2", staffId: "s1", customerName: "Lena Fischer", serviceName: "Full Color & Highlights", date: TODAY, startHour: 11, durationHours: 2, status: "confirmed" },
  { id: "a3", staffId: "s2", customerName: "Tariq Malik", serviceName: "Beard Trim", date: TODAY, startHour: 10, durationHours: 1, status: "confirmed" },
  { id: "a4", staffId: "s2", customerName: "Marcus Webb", serviceName: "Deep Conditioning Treatment", date: TODAY, startHour: 14, durationHours: 1, status: "no_show" },
  { id: "a5", staffId: "s3", customerName: "Jordan Blake", serviceName: "Express Facial", date: TODAY, startHour: 13, durationHours: 1, status: "confirmed" },
  { id: "a6", staffId: "s3", customerName: "Priya Nair", serviceName: "Classic Manicure", date: TODAY, startHour: 16, durationHours: 1, status: "cancelled" },
  { id: "a7", staffId: "s1", customerName: "Amara Osei", serviceName: "Bridal Package", date: "2026-07-30", startHour: 9, durationHours: 3, status: "confirmed" },
  { id: "a8", staffId: "s2", customerName: "Devon Marsh", serviceName: "Scalp Massage Add-on", date: "2026-07-31", startHour: 12, durationHours: 1, status: "confirmed" },
];

export function appointmentsForDate(date: string): Appointment[] {
  return APPOINTMENTS.filter((a) => a.date === date);
}

export function appointmentOccupying(appointments: Appointment[], staffId: string, hour: number, excludeId?: string): Appointment | undefined {
  return appointments.find(
    (a) => a.id !== excludeId && a.staffId === staffId && hour >= a.startHour && hour < a.startHour + a.durationHours,
  );
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
