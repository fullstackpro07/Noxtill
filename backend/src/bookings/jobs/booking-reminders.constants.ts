export const BOOKING_REMINDERS_QUEUE = 'booking-reminders';

/** Reminders fire this many hours before the appointment starts (spec: T-24h and T-2h). */
export const BOOKING_REMINDER_HOUR_OFFSETS = [24, 2];

/** How wide a window around each offset counts as "due" for a tick running every 15 min. */
export const BOOKING_REMINDER_WINDOW_MIN = 15;
