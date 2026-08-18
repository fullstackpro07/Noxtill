import { AppointmentStatus } from '@prisma/client';

/** Valid forward transitions (same flow-guard pattern as ORDER_STATUS_TRANSITIONS). */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  // Booking Requests (UPD-BE-016) — approve() moves requested -> confirmed, decline() -> cancelled.
  requested: [AppointmentStatus.confirmed, AppointmentStatus.cancelled],
  booked: [
    AppointmentStatus.confirmed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  confirmed: [
    AppointmentStatus.completed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  completed: [],
  no_show: [],
  cancelled: [],
};

export const BOOKING_ERROR_CODES = {
  SERVICE_NOT_FOUND: 'BOOKING_SERVICE_NOT_FOUND',
  SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
  NOT_REQUESTED: 'BOOKING_NOT_REQUESTED',
} as const;

export const WAITLIST_ERROR_CODES = {
  ENTRY_NOT_FOUND: 'waitlist.entry_not_found',
  NOT_WAITING: 'waitlist.not_waiting',
  NOT_OFFERED: 'waitlist.not_offered',
} as const;

export const QUEUE_ERROR_CODES = {
  TOKEN_NOT_FOUND: 'queue.token_not_found',
  INVALID_TRANSITION: 'queue.invalid_transition',
} as const;

export const DEPOSIT_ERROR_CODES = {
  DEPOSIT_NOT_FOUND: 'deposit.not_found',
  NOT_PENDING: 'deposit.not_pending',
  NOT_CAPTURED: 'deposit.not_captured',
  ONLINE_CAPTURE_NOT_SUPPORTED: 'deposit.online_capture_not_supported',
} as const;

/** How long a waitlist offer stays valid before it's eligible to be treated as expired (informational — nothing auto-expires it yet). */
export const WAITLIST_OFFER_HOLD_HOURS = 24;
